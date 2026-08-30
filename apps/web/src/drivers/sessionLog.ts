/**
 * localStorage adapter for the session log. Decode at the storage boundary.
 */

import {
  emptyLog,
  type KeepAwakeMode,
  type SessionFidelity,
  type SessionLog,
  type SessionRecord,
} from "@time/core"

export const SESSION_LOG_KEY = "time.session-log.v1"

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isKeepAwakeMode(value: unknown): value is KeepAwakeMode {
  return (
    value === "screen" ||
    value === "generated" ||
    value === "system" ||
    value === "presence"
  )
}

function isFidelity(value: unknown): value is SessionFidelity {
  return value === "seconds" || value === "milliseconds"
}

function readRecord(value: unknown): SessionRecord | null {
  if (!isObject(value)) return null
  if (typeof value.id !== "string" || value.id.length === 0) return null
  if (typeof value.startedAt !== "number" || typeof value.endedAt !== "number") {
    return null
  }
  if (typeof value.elapsedMs !== "number") return null
  if (!isKeepAwakeMode(value.mode) || !isFidelity(value.fidelity)) return null
  return {
    id: value.id,
    startedAt: value.startedAt,
    endedAt: value.endedAt,
    elapsedMs: value.elapsedMs,
    mode: value.mode,
    fidelity: value.fidelity,
  }
}

function readLog(value: unknown): SessionLog | null {
  if (!isObject(value)) return null
  if (typeof value.enabled !== "boolean" || !Array.isArray(value.records)) {
    return null
  }
  const records: SessionRecord[] = []
  for (const row of value.records) {
    const parsed = readRecord(row)
    if (!parsed) return null
    records.push(parsed)
  }
  return { enabled: value.enabled, records }
}

export function loadSessionLog(
  storage: Pick<Storage, "getItem"> = localStorage,
): SessionLog {
  const raw = storage.getItem(SESSION_LOG_KEY)
  if (raw === null) return emptyLog()
  try {
    const parsed: unknown = JSON.parse(raw)
    return readLog(parsed) ?? emptyLog()
  } catch {
    return emptyLog()
  }
}

export function saveSessionLog(
  log: SessionLog,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  storage.setItem(SESSION_LOG_KEY, JSON.stringify(log))
}
