/**
 * Document title for the live clock.
 *
 * Digit math matches `crates/frame_engine` so the tab label and the painted
 * timer stay the same string. The title is a poll of `elapsedMs`, not a rAF
 * paint — background tabs throttle animation frames, but still need a
 * glanceable elapsed time.
 */

import type { TimerFidelity } from "../frame"

export const BRAND_TITLE = "time"

export function formatElapsed(ms: number, fidelity: TimerFidelity): string {
  const t = ms <= 0 ? 0 : ms >>> 0
  const totalSecs = (t / 1000) >>> 0
  const mins = ((totalSecs / 60) >>> 0) % 100
  const secs = totalSecs % 60
  const mm = String(mins).padStart(2, "0")
  const ss = String(secs).padStart(2, "0")
  if (fidelity === "milliseconds") {
    return `${mm}:${ss}.${String(t % 1000).padStart(3, "0")}`
  }
  return `${mm}:${ss}`
}

export function documentTitleFor(input: {
  elapsedMs: number
  fidelity: TimerFidelity
  showElapsed: boolean
}): string {
  if (!input.showElapsed) return BRAND_TITLE
  return `${formatElapsed(input.elapsedMs, input.fidelity)} · ${BRAND_TITLE}`
}
