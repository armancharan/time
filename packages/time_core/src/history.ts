/**
 * Opt-in log of completed timer runs. Pure domain — persistence sits in the
 * web driver so unit tests stay hermetic.
 *
 * A record is one Start→Reset instance. Pause-with-tracker stretches nest as
 * `segments` under that instance.
 */

import type { KeepAwakeMode } from "./session"

export type SessionFidelity = "seconds" | "milliseconds"

/** How the stretch was timed: open elapsed, down from a cap, or up to a cap. */
export type SessionKind = "elapsed" | "countdown-from" | "count-up-to"

export type SessionSegment = {
  id: string
  startedAt: number
  endedAt: number
  elapsedMs: number
}

export type SessionRecord = {
  id: string
  startedAt: number
  endedAt: number
  elapsedMs: number
  kind: SessionKind
  mode: KeepAwakeMode
  fidelity: SessionFidelity
  segments: SessionSegment[]
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

export function addSegment(
  record: SessionRecord,
  segment: SessionSegment,
): SessionRecord {
  return { ...record, segments: [...record.segments, segment] }
}

/** Insert newest-first, or replace the same id in place. */
export function upsertRecord(log: SessionLog, record: SessionRecord): SessionLog {
  if (!log.enabled) return log
  const index = log.records.findIndex((row) => row.id === record.id)
  if (index === -1) return { ...log, records: [record, ...log.records] }
  const records = log.records.slice()
  records[index] = record
  return { ...log, records }
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
