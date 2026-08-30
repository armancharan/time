/**
 * Opt-in log of completed timer runs. Pure domain — persistence sits in the
 * web driver so unit tests stay hermetic.
 */

import type { KeepAwakeMode } from "./session"

export type SessionFidelity = "seconds" | "milliseconds"

export type SessionRecord = {
  id: string
  startedAt: number
  endedAt: number
  elapsedMs: number
  mode: KeepAwakeMode
  fidelity: SessionFidelity
}

export type SessionLog = {
  enabled: boolean
  records: SessionRecord[]
}

export function emptyLog(): SessionLog {
  return { enabled: false, records: [] }
}

export function setLogEnabled(log: SessionLog, enabled: boolean): SessionLog {
  if (log.enabled === enabled) return log
  return { ...log, enabled }
}

export function appendRecord(log: SessionLog, record: SessionRecord): SessionLog {
  if (!log.enabled) return log
  return { ...log, records: [record, ...log.records] }
}

export function removeRecord(log: SessionLog, id: string): SessionLog {
  const records = log.records.filter((row) => row.id !== id)
  if (records.length === log.records.length) return log
  return { ...log, records }
}

export function clearRecords(log: SessionLog): SessionLog {
  if (log.records.length === 0) return log
  return { ...log, records: [] }
}
