/**
 * Last typed Count up to duration. Decode uses `parseCountdownFrom`
 * (`25` is 25 minutes; `25:00` is 25:00; `1:30:00` is H:MM:SS).
 */

export const RUN_UNTIL_KEY = "time.count-up-to.v1"

export function loadRunUntil(
  storage: Pick<Storage, "getItem"> = localStorage,
): string {
  const raw = storage.getItem(RUN_UNTIL_KEY)
  if (raw === null) return ""
  try {
    const value = JSON.parse(raw)
    return typeof value === "string" ? value : ""
  } catch {
    return ""
  }
}

export function saveRunUntil(
  value: string,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  storage.setItem(RUN_UNTIL_KEY, JSON.stringify(value))
}
