import { describe, expect, it } from "vitest"
import {
  addSegment,
  appendRecord,
  clearRecords,
  emptyLog,
  removeRecord,
  setLogEnabled,
  upsertRecord,
  type SessionRecord,
  type SessionSegment,
} from "./history"

const run: SessionRecord = {
  id: "a",
  startedAt: 1_000,
  endedAt: 2_000,
  elapsedMs: 1_000,
  kind: "elapsed",
  mode: "generated",
  fidelity: "seconds",
  segments: [],
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

  it("nests a stretch under the parent instance", () => {
    const stretch: SessionSegment = {
      id: "s1",
      startedAt: 1_000,
      endedAt: 1_500,
      elapsedMs: 500,
    }
    expect(addSegment(run, stretch).segments).toEqual([stretch])
    expect(run.segments).toEqual([])
  })

  it("upserts a nested stretch onto the same parent", () => {
    const on = setLogEnabled(emptyLog(), true)
    const stretch: SessionSegment = {
      id: "s1",
      startedAt: 1_000,
      endedAt: 1_500,
      elapsedMs: 500,
    }
    const nested = addSegment(run, stretch)
    const first = upsertRecord(on, nested)
    expect(first.records).toEqual([nested])
    const later = addSegment(nested, { ...stretch, id: "s2", startedAt: 1_600 })
    const next = upsertRecord(first, later)
    expect(next.records.map((row) => row.id)).toEqual(["a"])
    expect(next.records[0]?.segments.map((row) => row.id)).toEqual(["s1", "s2"])
  })
})
