import "./styles/main.css"
import {
  capabilityFor,
  initialSession,
  offeredModes,
  reduceSession,
  type KeepAwakeMode,
  type SessionSnapshot,
  type StopReason,
} from "@time/core"
import { modeCopy } from "./copy/modes"
import { documentTitleFor } from "./drivers/documentTitle"
import { screenOptionState } from "./drivers/screenOption"
import {
  classifyWakeLockError,
  startWakeLockDriver,
  wakeLockSupported,
  wakeLockUserMessage,
  type DriverSession,
  type WakeLockFailureKind,
} from "./drivers/wakeLock"
import {
  createTimerController,
  loadFrameEngine,
  type FrameHost,
  type TimerController,
  type TimerFidelity,
} from "./frame"

/** Host for this page. Desktop detection lands with the Tauri shell. */
const RUNTIME = "web" as const

const OFFERED_MODES = offeredModes(RUNTIME)

let snap: SessionSnapshot = initialSession()
let mode: KeepAwakeMode = "generated"
let fidelity: TimerFidelity = "seconds"
let wakeDriver: DriverSession | null = null
let timer: TimerController | null = null
/** Bumps on every mode change so a slow prior swap cannot clobber a newer one. */
let surfaceGen = 0
/**
 * Skip mechanism list rebuilds during an in-flight mode switch. The browser
 * already checked the new radio; a full rebuild mid-swap can flicker ○/●.
 */
let modesPaintLocked = false
/** Last Screen Wake Lock consume failure — drives disable + retry prompt. */
let screenFailure: WakeLockFailureKind | null = null
/** Interval that polls elapsed time into `document.title` while the clock runs. */
let titleLoop = 0

const root = document.querySelector<HTMLDivElement>("#app")
if (!root) throw new Error("#app missing")

root.innerHTML = `
  <main class="shell">
    <header class="masthead">
      <h1 class="brand">time</h1>
      <p class="lede">
        <span>a monument,</span>
        <span>to the concept,</span>
        <span>that is</span>
      </p>
    </header>

    <div class="preview">
      <div class="stage" data-ref="stage">
        <canvas
          data-testid="preview-canvas"
          data-ref="canvas"
          class="preview-surface"
          width="320"
          height="200"
          hidden
        ></canvas>
        <video
          data-testid="preview-video"
          data-ref="video"
          class="preview-surface"
          playsinline
          muted
        ></video>
        <div class="actions">
          <button class="primary" type="button" data-ref="toggle" aria-pressed="false">
            <span class="btn-icon" aria-hidden="true" data-ref="toggle-icon-start"></span>
            <span data-ref="toggle-label">Start</span>
            <span class="btn-icon" aria-hidden="true" data-ref="toggle-icon-end"></span>
          </button>
          <button class="secondary" type="button" data-ref="pause" hidden>
            <span class="btn-icon" aria-hidden="true" data-ref="pause-icon"></span>
            <span data-ref="pause-label">Pause</span>
          </button>
        </div>
      </div>
      <p
        class="stage-status sr-only"
        data-testid="status"
        data-ref="status"
        aria-live="polite"
      ></p>
    </div>

    <div class="slots">
      <section class="slot picker" data-slot="fidelity" aria-labelledby="fidelity-label">
      <h2 class="picker-label" id="fidelity-label">Fidelity</h2>
      <div
        class="modes"
        role="radiogroup"
        aria-labelledby="fidelity-label"
        data-ref="fidelity"
      >
        <label class="mode is-selected">
          <span class="mode-control">
            <input type="radio" name="fidelity" value="seconds" checked />
            <span class="mode-mark" aria-hidden="true"></span>
          </span>
          <span class="mode-copy">
            <span class="mode-title">Seconds</span>
            <span class="mode-blurb">Timer as <code class="mode-code">MM:SS</code>.</span>
          </span>
        </label>
        <label class="mode">
          <span class="mode-control">
            <input type="radio" name="fidelity" value="milliseconds" />
            <span class="mode-mark" aria-hidden="true"></span>
          </span>
          <span class="mode-copy">
            <span class="mode-title">Milliseconds</span>
            <span class="mode-blurb">Timer as <code class="mode-code">MM:SS.mmm</code>.</span>
          </span>
        </label>
      </div>
      </section>

      <section class="slot picker" data-slot="mechanism" aria-labelledby="mechanism-label">
      <h2 class="picker-label" id="mechanism-label">Mechanism</h2>
      <div
        class="modes"
        role="radiogroup"
        aria-labelledby="mechanism-label"
        data-ref="modes"
      ></div>
      </section>

      <section class="slot picker" data-slot="history" aria-labelledby="history-label">
        <h2 class="picker-label" id="history-label">History</h2>
        <div data-ref="history">
          <p class="slot-note">Tracking is off.</p>
        </div>
      </section>

      <section class="slot slot-empty" data-slot="reserved-a" aria-hidden="true"></section>
    </div>

    <footer class="colophon">
      <p class="dedication">A product of dedication.</p>
      <p class="lineage">from tabawake</p>
      <a
        class="home-link"
        href="https://armancharan.com"
        rel="noopener noreferrer"
      >Back to armancharan.com →</a>
    </footer>
  </main>
`

const els = {
  modes: root.querySelector<HTMLDivElement>("[data-ref=modes]")!,
  fidelity: root.querySelector<HTMLDivElement>("[data-ref=fidelity]")!,
  toggle: root.querySelector<HTMLButtonElement>("[data-ref=toggle]")!,
  toggleLabel: root.querySelector<HTMLSpanElement>("[data-ref=toggle-label]")!,
  toggleIconStart: root.querySelector<HTMLSpanElement>(
    "[data-ref=toggle-icon-start]",
  )!,
  toggleIconEnd: root.querySelector<HTMLSpanElement>(
    "[data-ref=toggle-icon-end]",
  )!,
  pause: root.querySelector<HTMLButtonElement>("[data-ref=pause]")!,
  pauseLabel: root.querySelector<HTMLSpanElement>("[data-ref=pause-label]")!,
  pauseIcon: root.querySelector<HTMLSpanElement>("[data-ref=pause-icon]")!,
  status: root.querySelector<HTMLParagraphElement>("[data-ref=status]")!,
  stage: root.querySelector<HTMLDivElement>("[data-ref=stage]")!,
  canvas: root.querySelector<HTMLCanvasElement>("[data-ref=canvas]")!,
  video: root.querySelector<HTMLVideoElement>("[data-ref=video]")!,
}

function activeHost(): FrameHost {
  return mode === "screen" ? els.canvas : els.video
}

function surfaceEl(kind: "canvas" | "video"): HTMLCanvasElement | HTMLVideoElement {
  return kind === "canvas" ? els.canvas : els.video
}

function clearSurfaceClasses(el: HTMLElement) {
  el.classList.remove("is-parked")
}

/** Show the active host; hide the other. No opacity animation. */
function syncSurfaceVisibility() {
  const useCanvas =
    (timer?.sink.kind ?? (mode === "screen" ? "canvas" : "video")) === "canvas"
  const active = useCanvas ? els.canvas : els.video
  const idle = useCanvas ? els.video : els.canvas

  clearSurfaceClasses(active)
  clearSurfaceClasses(idle)
  active.hidden = false
  idle.hidden = true
}

/** Hard-cut to `incoming` once it is primed; park is cleared here. */
function commitSurface(incomingKind: "canvas" | "video") {
  const incoming = surfaceEl(incomingKind)
  const outgoing = surfaceEl(incomingKind === "canvas" ? "video" : "canvas")
  clearSurfaceClasses(incoming)
  clearSurfaceClasses(outgoing)
  incoming.hidden = false
  outgoing.hidden = true
}

/** Move radio selection without rebuilding — avoids ○/● remount flicker. */
function patchModeSelection(selected: KeepAwakeMode) {
  els.modes.querySelectorAll<HTMLLabelElement>("label.mode").forEach((label) => {
    const input = label.querySelector<HTMLInputElement>('input[name="mode"]')
    if (!input) return
    const on = input.value === selected
    input.checked = on
    label.classList.toggle("is-selected", on)
  })
}

function patchFidelitySelection(selected: TimerFidelity) {
  els.fidelity.querySelectorAll<HTMLLabelElement>("label.mode").forEach((label) => {
    const input = label.querySelector<HTMLInputElement>('input[name="fidelity"]')
    if (!input) return
    const on = input.value === selected
    input.checked = on
    label.classList.toggle("is-selected", on)
  })
}

function onFidelityChange(next: TimerFidelity) {
  if (next === fidelity) return
  fidelity = next
  patchFidelitySelection(next)
  timer?.setFidelity(next)
  restartTitleLoop()
}

function modeLabel(m: KeepAwakeMode | null): string {
  if (!m) return "—"
  return modeCopy(RUNTIME, m).label
}

function statusLine(): string {
  const shown = mode
  if (snap.state === "active") {
    return `On · ${modeLabel(shown)}`
  }
  if (snap.state === "paused") {
    return `Paused · ${modeLabel(shown)}`
  }
  if (snap.state === "error") {
    return snap.message ? `Couldn’t start — ${snap.message}` : "Couldn’t start"
  }
  if (snap.lastReason === "user") {
    return `Reset · ${modeLabel(shown)}`
  }
  if (snap.lastReason) {
    return `Stopped · ${humanReason(snap.lastReason)} · ${modeLabel(shown)}`
  }
  return `Ready · ${modeLabel(shown)}`
}

function humanReason(reason: StopReason): string {
  switch (reason) {
    case "user":
      return "you stopped it"
    case "visibility_loss":
      return "you left this tab"
    case "permission_denied":
      return "the browser blocked it"
    case "unsupported":
      return "not available here"
    case "driver_error":
      return "something went wrong"
    case "paused":
      return "paused"
    default:
      return reason
  }
}

function recordScreenFailure(err: unknown) {
  screenFailure = classifyWakeLockError(err, wakeLockSupported())
}

function clearScreenFailure() {
  screenFailure = null
}

/**
 * Update selection / disabled / prompt without remounting radios.
 * Remounting via `innerHTML` remakes ○/● and reads as a flicker.
 * Returns false when structure must be rebuilt (missing nodes or prompt layout).
 */
function patchModesInPlace(
  screen: ReturnType<typeof screenOptionState>,
  selected: KeepAwakeMode,
): boolean {
  const screenInput = els.modes.querySelector<HTMLInputElement>(
    'input[name="mode"][value="screen"]',
  )
  const videoInput = els.modes.querySelector<HTMLInputElement>(
    'input[name="mode"][value="generated"]',
  )
  const screenLabel = screenInput?.closest<HTMLLabelElement>("label.mode")
  const videoLabel = videoInput?.closest<HTMLLabelElement>("label.mode")
  const copy = screenLabel?.querySelector(".mode-copy")
  if (!screenInput || !videoInput || !screenLabel || !videoLabel || !copy) {
    return false
  }

  const errorEl = copy.querySelector<HTMLElement>(".mode-error")
  const hasRetry = !!errorEl?.querySelector("[data-ref=screen-retry]")
  const needsPrompt = screen.prompt !== null
  const hasPrompt = !!errorEl
  if (needsPrompt !== hasPrompt || screen.showRetry !== hasRetry) {
    return false
  }

  screenInput.disabled = screen.disabled
  screenLabel.classList.toggle("is-disabled", screen.disabled)
  videoInput.disabled = false
  videoLabel.classList.remove("is-disabled")
  patchModeSelection(selected)

  if (errorEl && screen.prompt) {
    const retryHtml = screen.showRetry
      ? ` <button type="button" class="mode-retry" data-ref="screen-retry">Try again</button>`
      : ""
    errorEl.innerHTML = `${screen.prompt}${retryHtml}`
    errorEl
      .querySelectorAll<HTMLButtonElement>("[data-ref=screen-retry]")
      .forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.preventDefault()
          event.stopPropagation()
          void retryScreenMechanism()
        })
      })
  }
  return true
}

function paintModes() {
  // Prefer live `mode` (user intent) for the radio ●.
  const selected = mode
  const hasModes = !!els.modes.querySelector('input[name="mode"]')

  // Mid-switch: keep the checked radio; do not remount.
  if (modesPaintLocked && hasModes) {
    patchModeSelection(selected)
    return
  }

  const screen = screenOptionState({
    apiPresent: wakeLockSupported(),
    failure: screenFailure,
    selected: selected === "screen",
    unsupportedMessage: wakeLockUserMessage("unsupported", RUNTIME),
    blockedMessage: wakeLockUserMessage("permission_denied", RUNTIME),
    driverMessage: wakeLockUserMessage("driver_error", RUNTIME),
  })

  if (hasModes && patchModesInPlace(screen, selected)) {
    return
  }

  els.modes.innerHTML = OFFERED_MODES.map((m) => {
    const copy = modeCopy(RUNTIME, m)
    if (m === "screen") {
      const retry = screen.showRetry
        ? ` <button type="button" class="mode-retry" data-ref="screen-retry">Try again</button>`
        : ""
      const prompt = screen.prompt
        ? `<span class="mode-error" role="alert">${screen.prompt}${retry}</span>`
        : ""
      return `
      <label class="mode${screen.selected ? " is-selected" : ""}${screen.disabled ? " is-disabled" : ""}">
        <span class="mode-control">
          <input type="radio" name="mode" value="${m}"
            ${screen.selected ? "checked" : ""}
            ${screen.disabled ? "disabled" : ""} />
          <span class="mode-mark" aria-hidden="true"></span>
        </span>
        <span class="mode-copy">
          <span class="mode-title">${copy.label}</span>
          <span class="mode-blurb">${copy.blurbHtml}</span>
          ${prompt}
        </span>
      </label>`
    }

    const isSelected = selected === m
    return `
      <label class="mode${isSelected ? " is-selected" : ""}">
        <span class="mode-control">
          <input type="radio" name="mode" value="${m}"
            ${isSelected ? "checked" : ""} />
          <span class="mode-mark" aria-hidden="true"></span>
        </span>
        <span class="mode-copy">
          <span class="mode-title">${copy.label}</span>
          <span class="mode-blurb">${copy.blurbHtml}</span>
        </span>
      </label>`
  }).join("")

  els.modes.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach((el) => {
    el.addEventListener("change", () => {
      if (el.checked) {
        void onModeChange(el.value as KeepAwakeMode)
      }
    })
  })

  els.modes.querySelectorAll<HTMLAnchorElement>("a.mode-docs").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.stopPropagation()
    })
  })

  els.modes
    .querySelectorAll<HTMLButtonElement>("[data-ref=screen-retry]")
    .forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault()
        event.stopPropagation()
        void retryScreenMechanism()
      })
    })
}

function paintStatus() {
  els.status.textContent = statusLine()
}

function paintTitle() {
  const next = documentTitleFor({
    elapsedMs: timer?.elapsedMs ?? 0,
    fidelity,
    showElapsed: snap.state === "active" || snap.state === "paused",
  })
  if (document.title !== next) {
    document.title = next
  }
}

/** Tick the tab title while the clock advances; freeze or restore the brand otherwise. */
function ensureTitleLoop() {
  paintTitle()
  const shouldTick = snap.state === "active"
  if (shouldTick && !titleLoop) {
    titleLoop = window.setInterval(
      paintTitle,
      fidelity === "milliseconds" ? 100 : 250,
    )
    return
  }
  if (!shouldTick && titleLoop) {
    clearInterval(titleLoop)
    titleLoop = 0
  }
}

function restartTitleLoop() {
  if (titleLoop) {
    clearInterval(titleLoop)
    titleLoop = 0
  }
  ensureTitleLoop()
}

function paint() {
  const sessionOn = snap.state === "active" || snap.state === "paused"
  const isPaused = snap.state === "paused"
  els.toggleLabel.textContent = sessionOn ? "Reset" : "Start"
  if (sessionOn) {
    els.toggleIconStart.textContent = "↺"
    els.toggleIconEnd.textContent = ""
  } else {
    els.toggleIconStart.textContent = ""
    els.toggleIconEnd.textContent = ""
  }
  els.toggle.setAttribute("aria-pressed", sessionOn ? "true" : "false")
  els.toggle.disabled = capabilityFor(RUNTIME, mode) === "unsupported" && !sessionOn
  els.pause.hidden = !sessionOn
  els.pauseLabel.textContent = isPaused ? "Resume" : "Pause"
  els.pauseIcon.textContent = isPaused ? "▶" : "⏸"
  els.pause.disabled = false
  els.stage.dataset.elapsedMs = String(timer?.elapsedMs ?? 0)
  paintStatus()
  ensureTitleLoop()
  syncSurfaceVisibility()
  paintModes()
  patchFidelitySelection(fidelity)
}

type SurfaceResume = "idle" | "play" | "pause"

function applyResume(controller: TimerController, resume: SurfaceResume, tMs: number) {
  if (resume === "play") {
    return controller.play(tMs)
  }
  if (resume === "pause") {
    controller.show(tMs)
    controller.pause()
    return
  }
  if (!controller.playing && !controller.paused) {
    controller.show(tMs)
  }
}

/** Wait two animation frames so a hidden <video> can present its first sample. */
function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

/** Mount a controller on the active host; optionally resume clock state. */
async function ensureSurface(opts?: {
  tMs?: number
  gen?: number
  resume?: SurfaceResume
}) {
  const gen = opts?.gen ?? surfaceGen
  const resume = opts?.resume ?? "idle"
  const host = activeHost()
  const wantKind = mode === "screen" ? "canvas" : "video"

  if (!timer || timer.sink.kind !== wantKind) {
    const prev = timer
    if (gen !== surfaceGen) return

    const incoming = surfaceEl(wantKind)
    // Park under the live surface so video can decode without a flash.
    clearSurfaceClasses(incoming)
    incoming.hidden = false
    incoming.classList.add("is-parked")

    // Seed the parked frame; handoff re-samples live elapsed from `prev`.
    const seedMs = opts?.tMs ?? prev?.elapsedMs ?? 0
    const next = await createTimerController(host, {
      initialMs: seedMs,
      fidelity,
    })
    if (gen !== surfaceGen) {
      next.dispose()
      incoming.hidden = true
      clearSurfaceClasses(incoming)
      return
    }

    // Let the parked surface present a first sample before the cut.
    await afterPaint()
    if (wantKind === "video") {
      await afterPaint()
    }
    if (gen !== surfaceGen) {
      next.dispose()
      incoming.hidden = true
      clearSurfaceClasses(incoming)
      return
    }

    // Live handoff — sample prev at the last moment so the clock does not jump.
    const handoffMs =
      resume !== "idle" && prev
        ? prev.elapsedMs
        : (opts?.tMs ?? prev?.elapsedMs ?? 0)
    await applyResume(next, resume, handoffMs)
    if (gen !== surfaceGen) {
      next.dispose()
      incoming.hidden = true
      clearSurfaceClasses(incoming)
      return
    }

    timer = next
    commitSurface(wantKind)
    prev?.dispose()
    return
  }

  syncSurfaceVisibility()
  await applyResume(timer, resume, opts?.tMs ?? timer.elapsedMs)
}

async function stopDriverOnly(reason: StopReason = "user") {
  const current = wakeDriver
  wakeDriver = null
  if (current) {
    await current.stop(reason)
  }
}

async function acquireScreenDriver(): Promise<DriverSession> {
  return startWakeLockDriver(async (reason) => {
    await stopSession(reason)
  })
}

async function startDriverForCurrentMode() {
  if (mode === "screen") {
    wakeDriver = await acquireScreenDriver()
    clearScreenFailure()
    return
  }
  if (mode === "generated") {
    void els.video.play().catch(() => {
      /* timer.play already kicked playback */
    })
    wakeDriver = {
      stop: async () => {
        /* stay-awake ends with session; timer reset separately */
      },
    }
    return
  }
  throw Object.assign(
    new Error(`${modeCopy(RUNTIME, mode).label} is not supported on this host`),
    {
      reason: "unsupported" as StopReason,
    },
  )
}

/**
 * Probe Screen Wake Lock without failing the session.
 * On failure, records `screenFailure` and forces Video if Screen was selected.
 */
async function preflightScreen(): Promise<DriverSession | null> {
  if (!wakeLockSupported()) {
    screenFailure = "unsupported"
    if (mode === "screen") mode = "generated"
    paint()
    return null
  }
  try {
    const driver = await acquireScreenDriver()
    clearScreenFailure()
    return driver
  } catch (err) {
    recordScreenFailure(err)
    if (mode === "screen") mode = "generated"
    paint()
    return null
  }
}

/** Re-probe Wake Lock; keep the error visible until the probe settles. */
async function retryScreenMechanism() {
  els.modes.classList.add("is-fading")
  try {
    const pending = await preflightScreen()
    if (!pending) return
    await pending.stop("user")
    if (mode !== "screen") {
      await onModeChange("screen")
    } else {
      paint()
    }
  } finally {
    els.modes.classList.remove("is-fading")
  }
}

async function onModeChange(next: KeepAwakeMode) {
  if (next === mode) return
  if (capabilityFor(RUNTIME, next) === "unsupported") return

  const sessionLive = snap.state === "active" || snap.state === "paused"
  let pendingScreen: DriverSession | null = null

  if (next === "screen") {
    if (!wakeLockSupported()) {
      screenFailure = "unsupported"
      paint()
      return
    }
    if (screenFailure) {
      // Disabled until Try again clears the failure.
      paint()
      return
    }
    if (sessionLive) {
      pendingScreen = await preflightScreen()
      if (!pendingScreen) return
    }
  } else {
    // Leaving Screen does not clear a prior block — user can still Try again.
  }

  const previous = mode
  const gen = ++surfaceGen

  const resume: SurfaceResume = sessionLive
    ? snap.state === "paused"
      ? "pause"
      : "play"
    : "idle"

  mode = next
  if (sessionLive) {
    snap = reduceSession(snap, { type: "SWITCH_MODE", mode: next })
  }
  modesPaintLocked = true
  patchModeSelection(next)
  paint()

  try {
    if (sessionLive) {
      await stopDriverOnly("user")
      if (gen !== surfaceGen) {
        await pendingScreen?.stop("user")
        return
      }
    }
    await ensureSurface({
      // Live elapsed is sampled from the outgoing timer at handoff.
      tMs: sessionLive ? undefined : 0,
      gen,
      resume: sessionLive ? resume : "idle",
    })
    if (gen !== surfaceGen) {
      await pendingScreen?.stop("user")
      return
    }
    if (!sessionLive) return

    if (pendingScreen) {
      wakeDriver = pendingScreen
      pendingScreen = null
      clearScreenFailure()
    } else {
      await startDriverForCurrentMode()
    }
  } catch (err) {
    if (gen !== surfaceGen) {
      await pendingScreen?.stop("user")
      return
    }
    await pendingScreen?.stop("user")
    mode = previous
    if (sessionLive) {
      snap = reduceSession(snap, { type: "SWITCH_MODE", mode: previous })
    }
    if (next === "screen") {
      recordScreenFailure(err)
      mode = "generated"
      if (sessionLive) {
        snap = reduceSession(snap, { type: "SWITCH_MODE", mode: "generated" })
      }
    }
    try {
      await stopDriverOnly("driver_error")
      await ensureSurface({
        tMs: sessionLive ? undefined : 0,
        gen: surfaceGen,
        resume: sessionLive ? resume : "idle",
      })
      if (sessionLive) {
        await startDriverForCurrentMode()
      }
    } catch {
      /* keep prior UI; screenFailure already set when relevant */
    }
  } finally {
    if (gen === surfaceGen) {
      modesPaintLocked = false
      paint()
    } else {
      modesPaintLocked = false
    }
  }
}

els.toggle.addEventListener("click", () => {
  void onToggle()
})

els.pause.addEventListener("click", () => {
  void onPauseToggle()
})

els.fidelity.querySelectorAll<HTMLInputElement>('input[name="fidelity"]').forEach((el) => {
  el.addEventListener("change", () => {
    if (el.checked) {
      onFidelityChange(el.value as TimerFidelity)
    }
  })
})

async function onToggle() {
  if (snap.state === "active" || snap.state === "paused") {
    await stopSession("user")
    return
  }
  await startSession()
}

async function onPauseToggle() {
  if (!timer) return
  if (snap.state === "active") {
    timer.pause()
    snap = reduceSession(snap, { type: "PAUSE", reason: "paused" })
    paint()
    return
  }
  if (snap.state === "paused") {
    snap = reduceSession(snap, { type: "RESUME" })
    await timer.play(timer.elapsedMs)
    paint()
  }
}

async function startSession() {
  if (wakeDriver) {
    await stopSession("user")
  }

  let pendingScreen: DriverSession | null = null
  if (mode === "screen") {
    pendingScreen = await preflightScreen()
    if (!pendingScreen) {
      // Forced to Video by preflight; Start stays usable.
      return
    }
  }

  snap = reduceSession(snap, { type: "ARM", mode })
  snap = reduceSession(snap, { type: "START" })
  paint()

  try {
    await ensureSurface({ tMs: 0, resume: "play" })
    if (pendingScreen) {
      wakeDriver = pendingScreen
      pendingScreen = null
      clearScreenFailure()
    } else {
      await startDriverForCurrentMode()
    }
    paint()
  } catch (err) {
    await pendingScreen?.stop("user")
    await stopDriverOnly("driver_error")
    timer?.reset()
    if (mode === "screen") {
      recordScreenFailure(err)
      mode = "generated"
      snap = reduceSession(snap, { type: "STOP", reason: "user" })
    } else {
      const reason: StopReason =
        err && typeof err === "object" && "reason" in err
          ? (err as { reason: StopReason }).reason
          : "driver_error"
      const message = err instanceof Error ? err.message : String(err)
      snap = reduceSession(snap, { type: "FAIL", reason, message })
    }
    paint()
  }
}

async function stopSession(reason: StopReason) {
  await stopDriverOnly(reason)
  if (timer) {
    timer.reset()
  } else {
    await ensureSurface({ tMs: 0, resume: "idle" })
  }
  snap = reduceSession(snap, { type: "STOP", reason })
  paint()
}

async function boot() {
  if (!wakeLockSupported()) {
    screenFailure = "unsupported"
  }
  paint()
  try {
    await loadFrameEngine()
    await ensureSurface({ tMs: 0 })
    paint()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    els.status.textContent = `Timer failed to load — run pnpm wasm:stage (${message})`
  }
}

void boot()
