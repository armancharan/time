/**
 * Hermetic Node test for Bazel (`node --experimental-strip-types --test`).
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  appendRecord,
  clearRecords,
  emptyLog,
  removeRecord,
  setLogEnabled,
  type SessionRecord,
} from "./history.ts"

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
})
