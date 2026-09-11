/**
 * localStorage adapter for the stay-awake gate. Decode at the storage boundary.
 * Default on — the clock still runs without it; the display may sleep.
 */

export const KEEP_AWAKE_KEY = "time.keep-awake.v1"

export const DEFAULT_KEEP_AWAKE = true

export function loadKeepAwake(
  storage: Pick<Storage, "getItem"> = localStorage,
): boolean {
  const raw = storage.getItem(KEEP_AWAKE_KEY)
  if (raw === null) return DEFAULT_KEEP_AWAKE
  try {
    return JSON.parse(raw) === true
  } catch {
    return DEFAULT_KEEP_AWAKE
  }
}

export function saveKeepAwake(
  enabled: boolean,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  storage.setItem(KEEP_AWAKE_KEY, JSON.stringify(enabled))
}
