import { describe, expect, it } from "vitest"
import {
  loadCountdownFrom,
  parseCountdownFrom,
  saveCountdownFrom,
} from "./countdownFrom"

function memoryStorage(seed: Record<string, string> = {}) {
  const store = { ...seed }
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value
    },
  }
}

describe("parseCountdownFrom", () => {
  it("reads minutes, MM:SS, and H:MM:SS", () => {
    expect(parseCountdownFrom("25")).toBe(25 * 60_000)
    expect(parseCountdownFrom("1231")).toBe(1231 * 60_000)
    expect(parseCountdownFrom("25:00")).toBe(25 * 60_000)
    expect(parseCountdownFrom("1:30")).toBe(90_000)
    expect(parseCountdownFrom("1:30:00")).toBe(90 * 60_000)
    expect(parseCountdownFrom("  05:00  ")).toBe(5 * 60_000)
  })

  it("rejects empty, zero, and impossible clock parts", () => {
    expect(parseCountdownFrom("")).toBeNull()
    expect(parseCountdownFrom("0")).toBeNull()
    expect(parseCountdownFrom("0:00")).toBeNull()
    expect(parseCountdownFrom("1:60")).toBeNull()
    expect(parseCountdownFrom("1:30:99")).toBeNull()
    expect(parseCountdownFrom("1:60:00")).toBeNull()
    expect(parseCountdownFrom("nope")).toBeNull()
  })
})

describe("loadCountdownFrom", () => {
  it("defaults empty and round-trips the last typed value", () => {
    expect(loadCountdownFrom(memoryStorage())).toBe("")
    const storage = memoryStorage()
    saveCountdownFrom("5:00", storage)
    expect(loadCountdownFrom(storage)).toBe("5:00")
  })
})
