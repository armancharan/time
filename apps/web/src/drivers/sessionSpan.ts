/**
 * Human span for a completed session. Date once when start and end share a
 * calendar day in the given zone.
 */

import type { SessionKind } from "@time/core"

export function sessionKindMark(kind: SessionKind): {
  glyph: string
  label: string
} {
  if (kind === "countdown-from") return { glyph: "↓", label: "Countdown from" }
  if (kind === "count-up-to") return { glyph: "↑", label: "Count up to" }
  return { glyph: "→", label: "Elapsed" }
}

export function formatSessionSpan(
  startedAt: number,
  endedAt: number,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  })
  const time = clockTime(timeZone)
  const startDate = date.format(startedAt)
  const endDate = date.format(endedAt)
  const startTime = time.format(startedAt)
  const endTime = time.format(endedAt)
  if (startDate === endDate) {
    return `${startDate}, ${startTime} – ${endTime}`
  }
  return `${startDate}, ${startTime} – ${endDate}, ${endTime}`
}

/** Parent row for a run that has not been Reset yet. */
export function formatSessionOpen(
  startedAt: number,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  })
  const time = clockTime(timeZone)
  return `${date.format(startedAt)}, ${time.format(startedAt)} –`
}

/** Nested stretch under a parent instance — times only. */
export function formatSessionTimes(
  startedAt: number,
  endedAt: number,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  const time = clockTime(timeZone)
  return `${time.format(startedAt)} – ${time.format(endedAt)}`
}

function clockTime(timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  })
}
