import { describe, expect, it } from "vitest"
import {
  formatSessionOpen,
  formatSessionSpan,
  formatSessionTimes,
  sessionKindMark,
} from "./sessionSpan"

describe("formatSessionSpan", () => {
  it("shows one date when start and end are the same calendar day", () => {
    expect(
      formatSessionSpan(
        Date.UTC(2026, 7, 31, 10, 44),
        Date.UTC(2026, 7, 31, 10, 45),
        "UTC",
      ),
    ).toBe("31 Aug 2026, 10:44 – 10:45")
  })

  it("repeats the date when the session crosses midnight", () => {
    expect(
      formatSessionSpan(
        Date.UTC(2026, 7, 31, 23, 59),
        Date.UTC(2026, 8, 1, 0, 1),
        "UTC",
      ),
    ).toBe("31 Aug 2026, 23:59 – 1 Sept 2026, 00:01")
  })

  it("opens a live instance without an end time", () => {
    expect(formatSessionOpen(Date.UTC(2026, 7, 31, 10, 44), "UTC")).toBe(
      "31 Aug 2026, 10:44 –",
    )
  })

  it("nests a stretch as a time pair", () => {
    expect(
      formatSessionTimes(
        Date.UTC(2026, 7, 31, 10, 44),
        Date.UTC(2026, 7, 31, 10, 52),
        "UTC",
      ),
    ).toBe("10:44 – 10:52")
  })
})

describe("sessionKindMark", () => {
  it("marks elapsed, countdown, and count-up with arrows", () => {
    expect(sessionKindMark("elapsed")).toEqual({ glyph: "→", label: "Elapsed" })
    expect(sessionKindMark("countdown-from")).toEqual({
      glyph: "↓",
      label: "Countdown from",
    })
    expect(sessionKindMark("count-up-to")).toEqual({
      glyph: "↑",
      label: "Count up to",
    })
  })
})
