import { describe, expect, it } from "vitest"
import { loadRunUntil, saveRunUntil } from "./runUntil"

function memoryStorage(seed: Record<string, string> = {}) {
  const store = { ...seed }
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value
    },
  }
}

describe("loadRunUntil", () => {
  it("defaults empty and round-trips the last typed value", () => {
    expect(loadRunUntil(memoryStorage())).toBe("")
    const storage = memoryStorage()
    saveRunUntil("1231", storage)
    expect(loadRunUntil(storage)).toBe("1231")
  })
})
