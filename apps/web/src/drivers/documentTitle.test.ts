import { describe, expect, it } from "vitest"
import { BRAND_TITLE, documentTitleFor, formatElapsed } from "./documentTitle"

describe("formatElapsed", () => {
  it("renders MM:SS and MM:SS.mmm from the same millisecond origin", () => {
    expect(formatElapsed(0, "seconds")).toBe("00:00")
    expect(formatElapsed(39_459, "seconds")).toBe("00:39")
    expect(formatElapsed(39_459, "milliseconds")).toBe("00:39.459")
    expect(formatElapsed(61_000, "seconds")).toBe("01:01")
  })

  it("clamps non-positive time and wraps minutes at 100 like the frame engine", () => {
    expect(formatElapsed(-4, "seconds")).toBe("00:00")
    expect(formatElapsed(99 * 60_000 + 59_000, "seconds")).toBe("99:59")
    expect(formatElapsed(100 * 60_000, "seconds")).toBe("00:00")
  })
})

describe("documentTitleFor", () => {
  it("keeps the brand while idle and leads with the clock while elapsed is shown", () => {
    expect(
      documentTitleFor({
        elapsedMs: 1_500,
        fidelity: "seconds",
        showElapsed: false,
      }),
    ).toBe(BRAND_TITLE)
    expect(
      documentTitleFor({
        elapsedMs: 1_500,
        fidelity: "seconds",
        showElapsed: true,
      }),
    ).toBe("00:01 · time")
    expect(
      documentTitleFor({
        elapsedMs: 39_459,
        fidelity: "milliseconds",
        showElapsed: true,
      }),
    ).toBe("00:39.459 · time")
  })
})
