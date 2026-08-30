/**
 * WASM timer controller: static frames, play, pause at arbitrary elapsed ms.
 *
 * Idle shows 00:00 with no rAF loop. Pause freezes the displayed time.
 * Video sinks keep receiving the frozen frame so media stay-awake still holds.
 */

import { loadFrameEngine, type FrameEngine } from "./engine"
import {
  createFrameSink,
  type FrameHost,
  type FrameSink,
} from "./sink"

export type TimerFidelity = "seconds" | "milliseconds"

export type TimerController = {
  readonly sink: FrameSink
  /** Elapsed ms currently shown (frozen while paused / idle). */
  readonly elapsedMs: number
  /** True while the clock is advancing. */
  readonly playing: boolean
  /** True while frozen but still holding a video stream heartbeat. */
  readonly paused: boolean
  /** Digit resolution currently painted. */
  readonly fidelity: TimerFidelity
  /** Paint a single frame at `tMs` without starting the clock. */
  show: (tMs: number) => void
  /** Advance from `fromMs` (default: current elapsed). */
  play: (fromMs?: number) => Promise<void>
  /** Freeze at the current elapsed time. Returns that time. */
  pause: () => number
  /** Stop the clock and show 00:00 (keeps the sink mounted). */
  reset: () => void
  /** Switch MM:SS / MM:SS.mmm without remounting the sink. */
  setFidelity: (next: TimerFidelity) => void
  /** Tear down the sink entirely. */
  dispose: () => void
}

const WIDTH = 320
const HEIGHT = 200
const FPS_SECONDS = 10
const FPS_MILLISECONDS = 30

function fidelityCode(fidelity: TimerFidelity): number {
  return fidelity === "milliseconds" ? 1 : 0
}

function paintHz(fidelity: TimerFidelity): number {
  return fidelity === "milliseconds" ? FPS_MILLISECONDS : FPS_SECONDS
}

export async function createTimerController(
  host: FrameHost,
  opts?: { engine?: FrameEngine; initialMs?: number; fidelity?: TimerFidelity },
): Promise<TimerController> {
  const engine = opts?.engine ?? (await loadFrameEngine())
  const sink = createFrameSink(host)
  let fidelity: TimerFidelity = opts?.fidelity ?? "seconds"

  if (host instanceof HTMLCanvasElement) {
    host.width = WIDTH
    host.height = HEIGHT
  }

  let disposed = false
  let playing = false
  let paused = false
  let elapsedMs = 0
  let raf = 0
  let lastPaintAt = 0
  /** Bumped on cancel so an in-flight rAF cannot paint over Reset / Pause. */
  let loopGen = 0
  /** performance.now() origin such that elapsed = now - origin while playing. */
  let origin = 0

  const paint = (tMs: number) => {
    if (disposed) return
    elapsedMs = tMs >>> 0
    const bytes = engine.renderFrame(
      WIDTH,
      HEIGHT,
      elapsedMs,
      fidelityCode(fidelity),
    )
    void Promise.resolve(
      sink.present({ width: WIDTH, height: HEIGHT, bytes, tMs: elapsedMs }),
    ).catch(() => {
      /* disposing */
    })
  }

  const cancelLoop = () => {
    cancelAnimationFrame(raf)
    raf = 0
    loopGen += 1
  }

  const runAdvanceLoop = () => {
    const gen = loopGen
    const tick = (now: number) => {
      if (disposed || !playing || gen !== loopGen) return
      if (now - lastPaintAt >= 1000 / paintHz(fidelity)) {
        lastPaintAt = now
        paint(Math.max(0, now - origin))
      }
      if (disposed || !playing || gen !== loopGen) return
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
  }

  const runHoldLoop = (frozenMs: number) => {
    const gen = loopGen
    const hold = (now: number) => {
      if (disposed || !paused || gen !== loopGen) return
      if (now - lastPaintAt >= 1000 / paintHz(fidelity)) {
        lastPaintAt = now
        paint(frozenMs)
      }
      if (disposed || !paused || gen !== loopGen) return
      raf = requestAnimationFrame(hold)
    }
    raf = requestAnimationFrame(hold)
  }

  /** Re-present 00:00 for a few frames so captureStream actually shows it. */
  const pushIdleFrame = () => {
    const gen = loopGen
    let n = 0
    const push = () => {
      if (disposed || playing || paused || gen !== loopGen) return
      paint(0)
      n += 1
      if (n < 4) raf = requestAnimationFrame(push)
    }
    raf = requestAnimationFrame(push)
  }

  // Seed with the resume time so a mid-swap mount does not flash 00:00.
  paint(opts?.initialMs ?? 0)
  if (host instanceof HTMLVideoElement) {
    void host.play().catch(() => {
      /* autoplay may wait for a gesture */
    })
  }

  return {
    sink,
    get elapsedMs() {
      // Live while playing so mechanism handoffs do not jump backward.
      if (playing) {
        return Math.max(0, performance.now() - origin) >>> 0
      }
      return elapsedMs
    },
    get playing() {
      return playing
    },
    get paused() {
      return paused
    },
    get fidelity() {
      return fidelity
    },
    show(tMs) {
      if (disposed) return
      playing = false
      paused = false
      cancelLoop()
      paint(tMs)
    },
    async play(fromMs = elapsedMs) {
      if (disposed) return
      playing = true
      paused = false
      cancelLoop()
      elapsedMs = fromMs >>> 0
      origin = performance.now() - elapsedMs
      lastPaintAt = 0
      if (host instanceof HTMLVideoElement) {
        // Non-blocking: a hung play() must not freeze Start / Resume.
        void host.play().catch(() => {
          /* ignore */
        })
      }
      paint(elapsedMs)
      runAdvanceLoop()
    },
    pause() {
      if (disposed) return elapsedMs
      if (playing) {
        elapsedMs = Math.max(0, performance.now() - origin) >>> 0
      }
      playing = false
      paused = true
      cancelLoop()
      paint(elapsedMs)
      // Video stay-awake needs an active stream — heartbeat the frozen frame.
      if (sink.kind === "video") {
        lastPaintAt = 0
        runHoldLoop(elapsedMs)
      }
      return elapsedMs
    },
    reset() {
      if (disposed) return
      playing = false
      paused = false
      cancelLoop()
      paint(0)
      if (host instanceof HTMLVideoElement) {
        // Keep the element playing so captureStream can deliver 00:00.
        // pause() here freezes the previous timecode on screen.
        void host.play().catch(() => {
          /* ignore */
        })
        pushIdleFrame()
      }
    },
    setFidelity(next) {
      if (disposed || next === fidelity) return
      fidelity = next
      const tMs = playing
        ? Math.max(0, performance.now() - origin) >>> 0
        : elapsedMs
      paint(tMs)
    },
    dispose() {
      if (disposed) return
      disposed = true
      playing = false
      paused = false
      cancelLoop()
      sink.dispose()
    },
  }
}
