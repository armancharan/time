/**
 * Duration typed into Countdown from. Decode at the input boundary.
 * `25` is 25 minutes; `25:00` is 25:00; `1:30:00` is H:MM:SS.
 */

import { HOUR_WRAP } from "./documentTitle"

export const COUNTDOWN_FROM_KEY = "time.countdown-from.v2"

export const MAX_COUNTDOWN_MS = HOUR_WRAP * 3_600_000 - 1

export function parseCountdownFrom(raw: string): number | null {
  const text = raw.trim()
  if (!text) return null

  if (/^\d+$/.test(text)) {
    return durationMs(0, Number(text), 0)
  }

  const parts = text.split(":")
  if (parts.length < 2 || parts.length > 3) return null
  if (parts.some((part) => !/^\d+$/.test(part))) return null

  if (parts.length === 2) {
    const minutes = Number(parts[0])
    const seconds = Number(parts[1])
    if (seconds > 59) return null
    return durationMs(0, minutes, seconds)
  }

  const hours = Number(parts[0])
  const minutes = Number(parts[1])
  const seconds = Number(parts[2])
  if (minutes > 59 || seconds > 59) return null
  return durationMs(hours, minutes, seconds)
}

function durationMs(hours: number, minutes: number, seconds: number): number | null {
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null
  }
  const ms = ((hours * 60 + minutes) * 60 + seconds) * 1000
  if (ms <= 0 || ms > MAX_COUNTDOWN_MS) return null
  return ms
}

export function loadCountdownFrom(
  storage: Pick<Storage, "getItem"> = localStorage,
): string {
  const raw = storage.getItem(COUNTDOWN_FROM_KEY)
  if (raw === null) return ""
  try {
    const value = JSON.parse(raw)
    return typeof value === "string" ? value : ""
  } catch {
    return ""
  }
}

export function saveCountdownFrom(
  value: string,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  storage.setItem(COUNTDOWN_FROM_KEY, JSON.stringify(value))
}
