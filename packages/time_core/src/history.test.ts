import { describe, expect, it } from "vitest"
import {
  appendRecord,
  clearRecords,
  emptyLog,
  removeRecord,
  setLogEnabled,
  type SessionRecord,
} from "./history"

const run: SessionRecord = {
  id: "a",
  startedAt: 1_000,
  endedAt: 2_000,
  elapsedMs: 1_000,
  mode: "generated",
  fidelity: "seconds",
}

describe("session log", () => {
  it("skips writes while tracking is off", () => {
    const log = emptyLog()
    expect(appendRecord(log, run)).toEqual(log)
  })

  it("appends newest first once enabled", () => {
    const on = setLogEnabled(emptyLog(), true)
    const next = appendRecord(on, run)
    expect(next.records).toEqual([run])
    const later: SessionRecord = { ...run, id: "b", elapsedMs: 2_000 }
    expect(appendRecord(next, later).records.map((row) => row.id)).toEqual([
      "b",
      "a",
    ])
  })

  it("removes one row and clears all without changing the enabled flag", () => {
    let log = setLogEnabled(emptyLog(), true)
    log = appendRecord(log, run)
    log = appendRecord(log, { ...run, id: "b" })
    log = removeRecord(log, "a")
    expect(log.enabled).toBe(true)
    expect(log.records.map((row) => row.id)).toEqual(["b"])
    log = clearRecords(log)
    expect(log.enabled).toBe(true)
    expect(log.records).toEqual([])
  })

  it("turns tracking off without deleting rows", () => {
    let log = setLogEnabled(emptyLog(), true)
    log = appendRecord(log, run)
    log = setLogEnabled(log, false)
    expect(log.enabled).toBe(false)
    expect(log.records).toEqual([run])
  })
})
