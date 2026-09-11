import "./styles/main.css"
import {
  addSegment,
  appendRecord,
  capabilityFor,
  initialSession,
  offeredModes,
  reduceSession,
  setLogEnabled,
  clearRecords,
  removeRecord,
  upsertRecord,
  type KeepAwakeMode,
  type SessionKind,
  type SessionLog,
  type SessionRecord,
  type SessionSnapshot,
  type StopReason,
} from "@time/core"
import { modeCopy } from "./copy/modes"
import { documentTitleFor, formatLimitCaption } from "./drivers/documentTitle"
import {
  formatSessionOpen,
  formatSessionSpan,
  formatSessionTimes,
  sessionKindMark,
} from "./drivers/sessionSpan"
import { loadKeepAwake, saveKeepAwake } from "./drivers/keepAwake"
import {
  loadCountdownFrom,
  parseCountdownFrom,
  saveCountdownFrom,
} from "./drivers/countdownFrom"
import { loadRunUntil, saveRunUntil } from "./drivers/runUntil"
import { loadSessionLog, saveSessionLog } from "./drivers/sessionLog"
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
let log: SessionLog = loadSessionLog()
let keepAwake = loadKeepAwake()
/** Skip remounting the history list when only the tracking switch moved. */
let historyListKey = ""
/** Elapsed ms already closed into History by Pause with tracker. */
let trackedElapsedBase = 0
let countdownFromMs: number | null = null
let countUpToMs: number | null = null
/** Start→Reset instance that nested stretches attach to. */
let openRun: SessionRecord | null = null
/** Wall-clock start of the current Start→Reset instance. */
let instanceStartedAt: number | null = null

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
      </div>
      <div class="actions">
        <div class="action-group" data-ref="play-group">
          <button class="primary" type="button" data-ref="play">
            <span class="btn-icon" aria-hidden="true">▶</span>
            <span data-ref="play-label">Start</span>
          </button>
          <div class="action-flyout">
            <div class="start-flyout-rows">
              <div class="countdown-row">
                <button class="secondary" type="button" data-ref="countdown">
                  Countdown from
                </button>
                <input
                  class="countdown-input"
                  data-ref="countdown-from"
                  type="text"
                  inputmode="numeric"
                  autocomplete="off"
                  spellcheck="false"
                  aria-label="Countdown duration"
                  placeholder="00:00"
                  value="${loadCountdownFrom()}"
                />
              </div>
              <div class="countdown-row">
                <button class="secondary" type="button" data-ref="run-until">
                  Count up to
                </button>
                <input
                  class="countdown-input"
                  data-ref="run-until-at"
                  type="text"
                  inputmode="numeric"
                  autocomplete="off"
                  spellcheck="false"
                  aria-label="Count up to duration"
                  placeholder="00:00"
                  value="${loadRunUntil()}"
                />
              </div>
            </div>
          </div>
        </div>
        <div class="action-group">
          <button class="secondary" type="button" data-ref="pause" disabled>
            <span class="btn-icon" aria-hidden="true">⏸</span>
            Pause
          </button>
          <div class="action-flyout">
            <div class="pause-track-stack">
              <button
                class="secondary"
                type="button"
                data-ref="pause-track"
                disabled
                aria-describedby="pause-track-hint"
              >
                <span class="btn-icon" aria-hidden="true">⏸</span>
                Pause with tracker
              </button>
              <p
                class="pause-track-hint"
                id="pause-track-hint"
                data-ref="pause-track-hint-wrap"
                hidden
              >
                <button
                  type="button"
                  class="pause-track-hint-link"
                  data-ref="pause-track-hint"
                >
                  Enable <span class="pause-track-hint-slot">History</span>
                </button>
                to record with trackers
              </p>
            </div>
          </div>
        </div>
        <button class="secondary" type="button" data-ref="reset" disabled>
          <span class="btn-icon" aria-hidden="true">↺</span>
          Reset
        </button>
      </div>
      <p class="limit-note" data-ref="limit-note" hidden></p>
      <p
        class="stage-status sr-only"
        data-testid="status"
        data-ref="status"
        aria-live="polite"
      ></p>
    </div>

    <div class="slots">
      <div class="slots-stack">
      <section class="slot picker" data-slot="fidelity" aria-labelledby="fidelity-label">
        <div class="picker-head">
          <h2 class="picker-label" id="fidelity-label">Fidelity</h2>
          <div
            class="modes"
            role="radiogroup"
            aria-labelledby="fidelity-label"
            aria-describedby="fidelity-note"
            data-ref="fidelity"
          >
            <label class="mode is-selected">
              <span class="mode-control">
                <input type="radio" name="fidelity" value="seconds" checked />
                <span class="mode-mark" aria-hidden="true"></span>
              </span>
              <span class="mode-title">Seconds</span>
            </label>
            <label class="mode">
              <span class="mode-control">
                <input type="radio" name="fidelity" value="milliseconds" />
                <span class="mode-mark" aria-hidden="true"></span>
              </span>
              <span class="mode-title">Milliseconds</span>
            </label>
          </div>
        </div>
        <p class="picker-note" id="fidelity-note" data-ref="fidelity-note">
          Timer as <code class="mode-code">H:MM:SS</code>.
        </p>
      </section>

      <section class="slot picker" data-slot="history" aria-labelledby="history-label">
        <div class="picker-head">
          <h2 class="picker-label" id="history-label">History</h2>
          <button
            type="button"
            class="history-switch${log.enabled ? " is-on" : ""}"
            role="switch"
            aria-checked="${log.enabled ? "true" : "false"}"
            data-ref="history-enabled"
          >
            <span class="history-switch-track" aria-hidden="true">
              <span class="history-switch-knob"></span>
            </span>
            <span class="history-switch-title">Track sessions on this machine</span>
          </button>
        </div>
        <div data-ref="history"></div>
      </section>
      </div>

      <section class="slot picker" data-slot="mechanism" aria-labelledby="awake-label">
        <div class="picker-head">
          <h2 class="picker-label" id="awake-label">Keep screen awake</h2>
          <button
            type="button"
            class="history-switch${keepAwake ? " is-on" : ""}"
            role="switch"
            aria-checked="${keepAwake ? "true" : "false"}"
            aria-labelledby="awake-label"
            data-ref="awake-enabled"
          >
            <span class="history-switch-track" aria-hidden="true">
              <span class="history-switch-knob"></span>
            </span>
          </button>
        </div>
        <div class="mechanism-sub" data-ref="mechanism-sub"${keepAwake ? "" : " hidden"}>
          <h3 class="picker-subhead" id="mechanism-label">Mechanism</h3>
          <div
            class="modes"
            role="radiogroup"
            aria-labelledby="mechanism-label"
            data-ref="modes"
          ></div>
        </div>
        <p class="picker-note" data-ref="awake-note"${keepAwake ? " hidden" : ""}>
          The display may sleep.
        </p>
      </section>
    </div>

    <footer class="colophon">
      <p class="dedication">A product of dedication.</p>
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
  play: root.querySelector<HTMLButtonElement>("[data-ref=play]")!,
  playGroup: root.querySelector<HTMLDivElement>("[data-ref=play-group]")!,
  playLabel: root.querySelector<HTMLSpanElement>("[data-ref=play-label]")!,
  countdown: root.querySelector<HTMLButtonElement>("[data-ref=countdown]")!,
  countdownFrom: root.querySelector<HTMLInputElement>(
    "[data-ref=countdown-from]",
  )!,
  runUntil: root.querySelector<HTMLButtonElement>("[data-ref=run-until]")!,
  runUntilAt: root.querySelector<HTMLInputElement>(
    "[data-ref=run-until-at]",
  )!,
  pause: root.querySelector<HTMLButtonElement>("[data-ref=pause]")!,
  pauseTrack: root.querySelector<HTMLButtonElement>("[data-ref=pause-track]")!,
  pauseElapsed: root.querySelector<HTMLParagraphElement>(
    "[data-ref=pause-elapsed]",
  )!,
  pauseTrackHint: root.querySelector<HTMLButtonElement>(
    "[data-ref=pause-track-hint]",
  )!,
  pauseTrackHintWrap: root.querySelector<HTMLParagraphElement>(
    "[data-ref=pause-track-hint-wrap]",
  )!,
  reset: root.querySelector<HTMLButtonElement>("[data-ref=reset]")!,
  limitNote: root.querySelector<HTMLParagraphElement>("[data-ref=limit-note]")!,
  status: root.querySelector<HTMLParagraphElement>("[data-ref=status]")!,
  stage: root.querySelector<HTMLDivElement>("[data-ref=stage]")!,
  canvas: root.querySelector<HTMLCanvasElement>("[data-ref=canvas]")!,
  video: root.querySelector<HTMLVideoElement>("[data-ref=video]")!,
  history: root.querySelector<HTMLDivElement>("[data-ref=history]")!,
  historySwitch: root.querySelector<HTMLButtonElement>(
    "[data-ref=history-enabled]",
  )!,
  fidelityNote: root.querySelector<HTMLParagraphElement>(
    "[data-ref=fidelity-note]",
  )!,
  awakeSwitch: root.querySelector<HTMLButtonElement>(
    "[data-ref=awake-enabled]",
  )!,
  mechanismSub: root.querySelector<HTMLDivElement>(
    "[data-ref=mechanism-sub]",
  )!,
  awakeNote: root.querySelector<HTMLParagraphElement>("[data-ref=awake-note]")!,
}

function surfaceKind(): "canvas" | "video" {
  if (!keepAwake) return "canvas"
  return mode === "screen" ? "canvas" : "video"
}

function activeHost(): FrameHost {
  return surfaceKind() === "canvas" ? els.canvas : els.video
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
    (timer?.sink.kind ?? surfaceKind()) === "canvas"
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
function patchModeSelection(selected: KeepAwakeMode, animate = false) {
  els.modes.querySelectorAll<HTMLLabelElement>("label.mode").forEach((label) => {
    const input = label.querySelector<HTMLInputElement>('input[name="mode"]')
    if (!input) return
    const on = input.value === selected
    const was = label.classList.contains("is-selected")
    input.checked = on
    label.classList.toggle("is-selected", on)
    if (!on) {
      label.classList.remove("is-entering")
      return
    }
    if (animate && !was) {
      label.classList.remove("is-entering")
      void label.offsetWidth
      label.classList.add("is-entering")
    }
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
  els.fidelityNote.innerHTML =
    selected === "milliseconds"
      ? `Timer as <code class="mode-code">H:MM:SS.mmm</code>.`
      : `Timer as <code class="mode-code">H:MM:SS</code>.`
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
  const mech = keepAwake ? ` · ${modeLabel(shown)}` : ""
  const limit = limitCaption()
  const cap = limit ? ` · ${limit}` : ""
  if (snap.state === "active") {
    return `On${cap}${mech}`
  }
  if (snap.state === "paused") {
    return `Paused${cap}${mech}`
  }
  if (snap.state === "error") {
    return snap.message ? `Couldn’t start — ${snap.message}` : "Couldn’t start"
  }
  if (snap.lastReason === "user") {
    return `Reset${mech}`
  }
  if (snap.lastReason) {
    return `Stopped · ${humanReason(snap.lastReason)}${mech}`
  }
  return `Ready${mech}`
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

function persistLog() {
  saveSessionLog(log)
}

function limitCaption(): string {
  if (countdownFromMs !== null) {
    return formatLimitCaption("countdown-from", countdownFromMs)
  }
  if (countUpToMs !== null) {
    return formatLimitCaption("count-up-to", countUpToMs)
  }
  return ""
}

function paintLimitNote() {
  const live = snap.state === "active" || snap.state === "paused"
  const text = live ? limitCaption() : ""
  els.limitNote.textContent = text
  els.limitNote.hidden = !text
}

function paintStatus() {
  els.status.textContent = statusLine()
}

function paintHistory() {
  els.historySwitch.classList.toggle("is-on", log.enabled)
  els.historySwitch.setAttribute("aria-checked", log.enabled ? "true" : "false")
  const visible = visibleHistory()
  const listKey = visible.length
    ? `${openRun?.id ?? ""}|${visible
        .map((row) => `${row.id}:${row.segments.map((seg) => seg.id).join(",")}`)
        .join("\0")}`
    : `empty:${log.enabled}`
  if (listKey === historyListKey && els.history.querySelector(".history-pane, .history-empty")) {
    return
  }
  historyListKey = listKey
  const rows = visible
    .map((row) => historyItemHtml(row, openRun?.id === row.id))
    .join("")
  els.history.innerHTML = rows
    ? `<div class="history-pane">
         <div class="history-scroller" data-ref="history-scroller" tabindex="0">
           <ol class="history-list">${rows}</ol>
         </div>
       </div>
       <button type="button" class="mode-retry history-clear" data-ref="history-wipe-all">Clear all</button>`
    : `<p class="history-empty">${log.enabled ? "No sessions yet." : "Tracking is off."}</p>`
  els.history
    .querySelectorAll<HTMLButtonElement>("[data-wipe-id]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-wipe-id")
        if (!id) return
        log = removeRecord(log, id)
        persistLog()
        paintHistory()
      })
    })
  els.history
    .querySelector<HTMLButtonElement>("[data-ref=history-wipe-all]")
    ?.addEventListener("click", () => {
      log = clearRecords(log)
      persistLog()
      paintHistory()
    })
  bindHistoryScrollFade(
    els.history.querySelector<HTMLElement>("[data-ref=history-scroller]"),
  )
}

function visibleHistory(): SessionRecord[] {
  const rest = log.records.filter((row) => row.id !== openRun?.id)
  if (openRun && openRun.segments.length > 0) return [openRun, ...rest]
  return rest
}

function historyItemHtml(row: SessionRecord, live: boolean): string {
  const mark = sessionKindMark(row.kind)
  const when = live
    ? formatSessionOpen(row.startedAt)
    : formatSessionSpan(row.startedAt, row.endedAt)
  const clear = live
    ? ""
    : `<button type="button" class="mode-retry history-clear" data-wipe-id="${row.id}" aria-label="Clear">×</button>`
  const nested = row.segments.length
    ? `<ol class="history-segments">${row.segments
        .map(
          (seg) =>
            `<li class="history-segment">${formatSessionTimes(seg.startedAt, seg.endedAt)}</li>`,
        )
        .join("")}</ol>`
    : ""
  return `<li class="history-item" data-kind="${row.kind}">
    <div class="history-row" data-kind="${row.kind}">
      <span class="history-when">
        <span class="history-kind" aria-label="${mark.label}">${mark.glyph}</span>
        <span>${when}</span>
      </span>
      ${clear}
    </div>
    ${nested}
  </li>`
}

function bindHistoryScrollFade(scroller: HTMLElement | null) {
  if (!scroller) return
  const pane = scroller.parentElement
  if (!pane) return
  const sync = () => {
    const more =
      scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 1
    pane.classList.toggle("can-scroll-more", more)
  }
  scroller.addEventListener("scroll", sync, { passive: true })
  sync()
}

function paintTitle() {
  const next = documentTitleFor({
    elapsedMs: timer?.displayedMs ?? timer?.elapsedMs ?? 0,
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
  const isActive = snap.state === "active"
  const canPlay =
    isPaused ||
    (!sessionOn && capabilityFor(RUNTIME, mode) !== "unsupported")
  els.playLabel.textContent = isPaused ? "Resume" : "Start"
  els.play.disabled = !canPlay
  els.playGroup.classList.toggle("is-resume", isPaused)
  if (isPaused) dismissStartFlyoutErrors()
  els.pause.disabled = !isActive
  els.pauseTrack.disabled = !isActive || !log.enabled
  if (isActive && !log.enabled) {
    els.pauseTrack.setAttribute("aria-describedby", "pause-track-hint")
  } else {
    els.pauseTrack.removeAttribute("aria-describedby")
  }
  els.pauseTrackHintWrap.hidden = log.enabled || !isActive
  els.reset.disabled = !sessionOn
  els.stage.dataset.elapsedMs = String(timer?.elapsedMs ?? 0)
  paintStatus()
  paintLimitNote()
  ensureTitleLoop()
  paintHistory()
  paintKeepAwake()
  syncSurfaceVisibility()
  paintModes()
  patchFidelitySelection(fidelity)
}

function paintKeepAwake() {
  els.awakeSwitch.classList.toggle("is-on", keepAwake)
  els.awakeSwitch.setAttribute("aria-checked", keepAwake ? "true" : "false")
  els.mechanismSub.hidden = !keepAwake
  els.awakeNote.hidden = keepAwake
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
  const wantKind = surfaceKind()

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
      countdownFromMs,
      countUpToMs,
      onExhausted: onCountdownExhausted,
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
    next.setCountdownFrom(countdownFromMs)
    next.setCountUpTo(countUpToMs)
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
  timer.setCountdownFrom(countdownFromMs)
  timer.setCountUpTo(countUpToMs)
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

  if (!keepAwake) {
    mode = next
    paint()
    return
  }

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
  patchModeSelection(next, true)
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

async function onKeepAwakeToggle() {
  const next = !keepAwake
  keepAwake = next
  saveKeepAwake(keepAwake)
  const sessionLive = snap.state === "active" || snap.state === "paused"
  const resume: SurfaceResume = sessionLive
    ? snap.state === "paused"
      ? "pause"
      : "play"
    : "idle"
  const gen = ++surfaceGen
  paint()

  if (!keepAwake) {
    await stopDriverOnly("user")
    if (gen !== surfaceGen) return
    await ensureSurface({
      tMs: sessionLive ? undefined : 0,
      gen,
      resume,
    })
    return
  }

  let pendingScreen: DriverSession | null = null
  if (sessionLive && mode === "screen") {
    pendingScreen = await preflightScreen()
  }
  if (gen !== surfaceGen) {
    await pendingScreen?.stop("user")
    return
  }
  await ensureSurface({
    tMs: sessionLive ? undefined : 0,
    gen,
    resume,
  })
  if (gen !== surfaceGen) {
    await pendingScreen?.stop("user")
    return
  }
  if (!sessionLive) return
  if (pendingScreen) {
    wakeDriver = pendingScreen
    clearScreenFailure()
    return
  }
  await startDriverForCurrentMode()
}

els.play.addEventListener("click", () => {
  if (snap.state === "paused") {
    void onResume()
    return
  }
  void startSession()
})

els.countdown.addEventListener("click", () => {
  void startCountdownFrom()
})

els.runUntil.addEventListener("click", () => {
  void startRunUntil()
})

for (const el of [els.countdownFrom, els.runUntilAt]) {
  el.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    if (el === els.countdownFrom) void startCountdownFrom()
    else void startRunUntil()
  })
  el.addEventListener("focus", () => {
    const end = el.value.length
    requestAnimationFrame(() => {
      el.setSelectionRange(end, end)
    })
  })
  el.addEventListener("input", () => {
    el.removeAttribute("aria-invalid")
  })
}

els.playGroup.addEventListener("mouseleave", () => {
  dismissStartFlyoutErrors()
})

els.playGroup.addEventListener("focusout", (event) => {
  const next = event.relatedTarget
  if (next instanceof Node && els.playGroup.contains(next)) return
  clearStartFlyoutErrors()
})

els.pause.addEventListener("click", () => {
  void onPause()
})

els.pauseTrack.addEventListener("click", () => {
  void onPauseWithTracker()
})

els.reset.addEventListener("click", () => {
  void stopSession("user")
})

els.historySwitch.addEventListener("click", () => {
  log = setLogEnabled(log, !log.enabled)
  persistLog()
  paint()
})

els.pauseTrackHint.addEventListener("click", () => {
  log = setLogEnabled(log, true)
  persistLog()
  paint()
})

els.awakeSwitch.addEventListener("click", () => {
  void onKeepAwakeToggle()
})

els.fidelity.querySelectorAll<HTMLInputElement>('input[name="fidelity"]').forEach((el) => {
  el.addEventListener("change", () => {
    if (el.checked) {
      onFidelityChange(el.value as TimerFidelity)
    }
  })
})

function onCountdownExhausted() {
  void stopSession("user")
}

function clearStartFlyoutErrors() {
  els.countdownFrom.removeAttribute("aria-invalid")
  els.runUntilAt.removeAttribute("aria-invalid")
}

function dismissStartFlyoutErrors() {
  const active = document.activeElement
  clearStartFlyoutErrors()
  if (active === els.countdownFrom) els.countdownFrom.blur()
  else if (active === els.runUntilAt) els.runUntilAt.blur()
}

function startCountdownFrom() {
  if (snap.state === "paused" || snap.state === "active") return
  const raw = els.countdownFrom.value
  const ms = parseCountdownFrom(raw)
  if (ms === null) {
    els.countdownFrom.setAttribute("aria-invalid", "true")
    els.countdownFrom.focus()
    return
  }
  els.countdownFrom.removeAttribute("aria-invalid")
  saveCountdownFrom(raw.trim())
  void startSession({ countdownFromMs: ms })
}

function startRunUntil() {
  if (snap.state === "paused" || snap.state === "active") return
  const raw = els.runUntilAt.value
  const ms = parseCountdownFrom(raw)
  if (ms === null) {
    els.runUntilAt.setAttribute("aria-invalid", "true")
    els.runUntilAt.focus()
    return
  }
  els.runUntilAt.removeAttribute("aria-invalid")
  saveRunUntil(raw.trim())
  void startSession({ countUpToMs: ms })
}

async function onPause() {
  if (!timer || snap.state !== "active") return
  timer.pause()
  snap = reduceSession(snap, { type: "PAUSE", reason: "paused" })
  paint()
}

async function onPauseWithTracker() {
  if (!timer || snap.state !== "active" || !log.enabled) return
  closeStretch()
  timer.pause()
  snap = reduceSession(snap, {
    type: "PAUSE",
    reason: "paused",
    closeSegment: true,
  })
  paint()
}

function currentSessionKind(): SessionKind {
  if (countdownFromMs !== null) return "countdown-from"
  if (countUpToMs !== null) return "count-up-to"
  return "elapsed"
}

function ensureOpenRun() {
  if (openRun || !log.enabled) return
  const startedAt = instanceStartedAt ?? snap.startedAt
  if (startedAt === null) return
  openRun = {
    id: crypto.randomUUID(),
    startedAt,
    endedAt: startedAt,
    elapsedMs: 0,
    kind: currentSessionKind(),
    mode,
    fidelity,
    segments: [],
  }
}

function closeStretch() {
  ensureOpenRun()
  const total = timer?.elapsedMs ?? 0
  const elapsedMs = total - trackedElapsedBase
  const startedAt = snap.startedAt
  if (!openRun || !log.enabled || elapsedMs <= 0 || startedAt === null) return
  const endedAt = Date.now()
  openRun = {
    ...addSegment(openRun, {
      id: crypto.randomUUID(),
      startedAt,
      endedAt,
      elapsedMs,
    }),
    endedAt,
    elapsedMs: total,
  }
  log = upsertRecord(log, openRun)
  persistLog()
  trackedElapsedBase = total
}

function finishOpenRun() {
  if (!log.enabled) {
    openRun = null
    trackedElapsedBase = 0
    instanceStartedAt = null
    return
  }
  if (openRun && openRun.segments.length > 0) closeStretch()
  const startedAt = openRun?.startedAt ?? instanceStartedAt ?? snap.startedAt
  const elapsedMs = timer?.elapsedMs ?? 0
  if (startedAt !== null && (elapsedMs > 0 || (openRun?.segments.length ?? 0) > 0)) {
    const record: SessionRecord = {
      id: openRun?.id ?? crypto.randomUUID(),
      startedAt,
      endedAt: Date.now(),
      elapsedMs,
      kind: openRun?.kind ?? currentSessionKind(),
      mode: openRun?.mode ?? mode,
      fidelity: openRun?.fidelity ?? fidelity,
      segments: openRun?.segments ?? [],
    }
    log = openRun ? upsertRecord(log, record) : appendRecord(log, record)
    persistLog()
  }
  openRun = null
  trackedElapsedBase = 0
  instanceStartedAt = null
}

async function onResume() {
  if (!timer || snap.state !== "paused") return
  snap = reduceSession(snap, { type: "RESUME" })
  await timer.play(timer.elapsedMs)
  paint()
}

async function startSession(opts?: {
  countdownFromMs?: number
  countUpToMs?: number
}) {
  if (wakeDriver) {
    await stopSession("user")
  }

  let pendingScreen: DriverSession | null = null
  if (keepAwake && mode === "screen") {
    pendingScreen = await preflightScreen()
    if (!pendingScreen) {
      // Forced to Video by preflight; Start stays usable.
      return
    }
  }

  countdownFromMs = opts?.countdownFromMs ?? null
  countUpToMs = opts?.countUpToMs ?? null

  snap = reduceSession(snap, { type: "ARM", mode })
  snap = reduceSession(snap, { type: "START" })
  trackedElapsedBase = 0
  instanceStartedAt = snap.startedAt
  paint()

  try {
    await ensureSurface({ tMs: 0, resume: "play" })
    if (!keepAwake) {
      paint()
      return
    }
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
    countdownFromMs = null
    countUpToMs = null
    timer?.setCountdownFrom(null)
    timer?.setCountUpTo(null)
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
  finishOpenRun()
  countdownFromMs = null
  countUpToMs = null
  timer?.setCountdownFrom(null)
  timer?.setCountUpTo(null)
  await stopDriverOnly(reason)
  if (timer) {
    timer.reset()
  } else {
    await ensureSurface({ tMs: 0, resume: "idle" })
  }
  trackedElapsedBase = 0
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
