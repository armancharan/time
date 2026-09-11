import { describe, expect, it } from "vitest"
import { emptyLog, setLogEnabled, type SessionLog } from "@time/core"
import {
  loadSessionLog,
  saveSessionLog,
  SESSION_LOG_KEY,
} from "./sessionLog"

function memoryStorage(seed: Record<string, string> = {}) {
  const data = { ...seed }
  return {
    getItem(key: string) {
      return Object.hasOwn(data, key) ? data[key] : null
    },
    setItem(key: string, value: string) {
      data[key] = value
    },
  }
}

describe("loadSessionLog", () => {
  it("defaults tracking on when missing or corrupt", () => {
    const fresh = { enabled: true, records: [] }
    expect(loadSessionLog(memoryStorage())).toEqual(fresh)
    expect(
      loadSessionLog(memoryStorage({ [SESSION_LOG_KEY]: "{" })),
    ).toEqual(fresh)
    expect(
      loadSessionLog(memoryStorage({ [SESSION_LOG_KEY]: '{"enabled":true}' })),
    ).toEqual(fresh)
  })

  it("round-trips an enabled log", () => {
    const storage = memoryStorage()
    const log: SessionLog = setLogEnabled(emptyLog(), true)
    saveSessionLog(log, storage)
    expect(loadSessionLog(storage)).toEqual(log)
  })

  it("round-trips countdown-from and count-up-to kinds", () => {
    const storage = memoryStorage()
    const log: SessionLog = {
      enabled: true,
      records: [
        {
          id: "down",
          startedAt: 1,
          endedAt: 2,
          elapsedMs: 1,
          kind: "countdown-from",
          mode: "generated",
          fidelity: "seconds",
          segments: [],
        },
        {
          id: "up",
          startedAt: 3,
          endedAt: 4,
          elapsedMs: 1,
          kind: "count-up-to",
          mode: "generated",
          fidelity: "seconds",
          segments: [],
        },
      ],
    }
    saveSessionLog(log, storage)
    expect(loadSessionLog(storage)).toEqual(log)
  })

  it("defaults a missing kind to elapsed so v2 rows still load", () => {
    const storage = memoryStorage({
      [SESSION_LOG_KEY]: JSON.stringify({
        enabled: true,
        records: [
          {
            id: "a",
            startedAt: 1,
            endedAt: 2,
            elapsedMs: 1,
            mode: "generated",
            fidelity: "seconds",
            segments: [],
          },
        ],
      }),
    })
    expect(loadSessionLog(storage).records[0]?.kind).toBe("elapsed")
  })

  it("round-trips nested tracker stretches", () => {
    const storage = memoryStorage()
    const log: SessionLog = {
      enabled: true,
      records: [
        {
          id: "parent",
          startedAt: 1,
          endedAt: 4,
          elapsedMs: 3,
          kind: "elapsed",
          mode: "generated",
          fidelity: "seconds",
          segments: [
            {
              id: "s1",
              startedAt: 1,
              endedAt: 2,
              elapsedMs: 1,
            },
            {
              id: "s2",
              startedAt: 3,
              endedAt: 4,
              elapsedMs: 1,
            },
          ],
        },
      ],
    }
    saveSessionLog(log, storage)
    expect(loadSessionLog(storage)).toEqual(log)
  })
})
