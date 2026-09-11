import { describe, expect, it } from "vitest"
import {
  DEFAULT_KEEP_AWAKE,
  KEEP_AWAKE_KEY,
  loadKeepAwake,
  saveKeepAwake,
} from "./keepAwake"

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

describe("loadKeepAwake", () => {
  it("defaults on when missing or corrupt", () => {
    expect(loadKeepAwake(memoryStorage())).toBe(DEFAULT_KEEP_AWAKE)
    expect(loadKeepAwake(memoryStorage({ [KEEP_AWAKE_KEY]: "{" }))).toBe(
      DEFAULT_KEEP_AWAKE,
    )
  })

  it("round-trips off", () => {
    const storage = memoryStorage()
    saveKeepAwake(false, storage)
    expect(loadKeepAwake(storage)).toBe(false)
  })
})
