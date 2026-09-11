/**
 * Hermetic Node test for Bazel (`node --experimental-strip-types --test`).
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  addSegment,
  appendRecord,
  clearRecords,
  emptyLog,
  removeRecord,
  setLogEnabled,
  upsertRecord,
  type SessionRecord,
} from "./history.ts"

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
    assert.deepEqual(appendRecord(log, run), log)
  })

  it("appends newest first once enabled", () => {
    const on = setLogEnabled(emptyLog(), true)
    const next = appendRecord(on, run)
    assert.deepEqual(next.records, [run])
  })

  it("clears rows without changing the enabled flag", () => {
    let log = setLogEnabled(emptyLog(), true)
    log = appendRecord(log, run)
    log = clearRecords(log)
    assert.equal(log.enabled, true)
    assert.deepEqual(log.records, [])
    log = setLogEnabled(appendRecord(setLogEnabled(emptyLog(), true), run), false)
    assert.equal(log.enabled, false)
    assert.equal(log.records.length, 1)
    log = removeRecord(log, "a")
    assert.deepEqual(log.records, [])
  })

  it("nests a stretch under the parent instance", () => {
    const next = addSegment(run, {
      id: "s1",
      startedAt: 1_000,
      endedAt: 1_500,
      elapsedMs: 500,
    })
    assert.equal(next.segments.length, 1)
    assert.equal(run.segments.length, 0)
  })

  it("upserts a nested stretch onto the same parent", () => {
    const on = setLogEnabled(emptyLog(), true)
    const nested = addSegment(run, {
      id: "s1",
      startedAt: 1_000,
      endedAt: 1_500,
      elapsedMs: 500,
    })
    const first = upsertRecord(on, nested)
    const later = addSegment(nested, {
      id: "s2",
      startedAt: 1_600,
      endedAt: 1_800,
      elapsedMs: 200,
    })
    const next = upsertRecord(first, later)
    assert.deepEqual(
      next.records[0]?.segments.map((row) => row.id),
      ["s1", "s2"],
    )
  })
})
