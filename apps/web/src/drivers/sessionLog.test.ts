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
  it("returns empty when missing or corrupt", () => {
    expect(loadSessionLog(memoryStorage())).toEqual(emptyLog())
    expect(
      loadSessionLog(memoryStorage({ [SESSION_LOG_KEY]: "{" })),
    ).toEqual(emptyLog())
    expect(
      loadSessionLog(memoryStorage({ [SESSION_LOG_KEY]: '{"enabled":true}' })),
    ).toEqual(emptyLog())
  })

  it("round-trips an enabled log", () => {
    const storage = memoryStorage()
    const log: SessionLog = setLogEnabled(emptyLog(), true)
    saveSessionLog(log, storage)
    expect(loadSessionLog(storage)).toEqual(log)
  })
})
