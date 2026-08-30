import { describe, expect, it } from "vitest"
import {
  capabilityFor,
  desktopCapability,
  initialSession,
  offeredModes,
  reduceSession,
  webCapability,
  type SessionSnapshot,
} from "./session"

describe("reduceSession", () => {
  it("arms from idle", () => {
    const next = reduceSession(initialSession(), {
      type: "ARM",
      mode: "generated",
    })
    expect(next.state).toBe("armed")
    expect(next.mode).toBe("generated")
  })

  it("starts from armed", () => {
    const armed = reduceSession(initialSession(), {
      type: "ARM",
      mode: "screen",
    })
    const active = reduceSession(armed, { type: "START" }, 1_700_000_000_000)
    expect(active.state).toBe("active")
    expect(active.startedAt).toBe(1_700_000_000_000)
  })

  it("ignores illegal start from idle", () => {
    const snap = initialSession()
    expect(reduceSession(snap, { type: "START" })).toEqual(snap)
  })

  it("pauses and resumes", () => {
    let snap: SessionSnapshot = initialSession()
    snap = reduceSession(snap, { type: "ARM", mode: "screen" })
    snap = reduceSession(snap, { type: "START" }, 10)
    snap = reduceSession(snap, { type: "PAUSE", reason: "visibility_loss" })
    expect(snap.state).toBe("paused")
    expect(snap.lastReason).toBe("visibility_loss")
    snap = reduceSession(snap, { type: "RESUME" })
    expect(snap.state).toBe("active")
  })

  it("stops back to idle", () => {
    let snap = initialSession()
    snap = reduceSession(snap, { type: "ARM", mode: "generated" })
    snap = reduceSession(snap, { type: "START" }, 10)
    snap = reduceSession(snap, { type: "STOP", reason: "user" })
    expect(snap).toMatchObject({
      state: "idle",
      mode: null,
      lastReason: "user",
      startedAt: null,
    })
  })

  it("fails into error", () => {
    let snap = initialSession()
    snap = reduceSession(snap, { type: "ARM", mode: "screen" })
    snap = reduceSession(snap, {
      type: "FAIL",
      reason: "permission_denied",
      message: "Wake Lock denied",
    })
    expect(snap.state).toBe("error")
    expect(snap.message).toBe("Wake Lock denied")
  })

  it("switches mode while active and ignores switch from idle", () => {
    let snap = initialSession()
    expect(reduceSession(snap, { type: "SWITCH_MODE", mode: "screen" })).toEqual(
      snap,
    )
    snap = reduceSession(snap, { type: "ARM", mode: "generated" })
    snap = reduceSession(snap, { type: "START" }, 10)
    snap = reduceSession(snap, { type: "SWITCH_MODE", mode: "screen" })
    expect(snap).toMatchObject({
      state: "active",
      mode: "screen",
      startedAt: 10,
    })
    snap = reduceSession(snap, { type: "PAUSE", reason: "paused" })
    snap = reduceSession(snap, { type: "SWITCH_MODE", mode: "generated" })
    expect(snap).toMatchObject({
      state: "paused",
      mode: "generated",
    })
  })
})

describe("webCapability", () => {
  it("marks desktop-only modes unsupported", () => {
    expect(webCapability("generated")).toBe("supported")
    expect(webCapability("presence")).toBe("unsupported")
    expect(webCapability("screen")).toBe("supported")
    expect(webCapability("system")).toBe("unsupported")
  })
})

describe("desktopCapability", () => {
  it("supports screen and video and withholds what is not built", () => {
    expect(desktopCapability("generated")).toBe("supported")
    expect(desktopCapability("presence")).toBe("unsupported")
    expect(desktopCapability("screen")).toBe("supported")
    expect(desktopCapability("system")).toBe("unsupported")
  })
})

describe("capabilityFor", () => {
  it("selects the matrix by runtime", () => {
    expect(capabilityFor("web", "system")).toBe("unsupported")
    expect(capabilityFor("desktop", "system")).toBe("unsupported")
    expect(capabilityFor("desktop", "presence")).toBe("unsupported")
  })
})

describe("offeredModes", () => {
  describe("when the runtime is web", () => {
    it("omits unsupported modes", () => {
      expect(offeredModes("web")).toEqual(["screen", "generated"])
    })
  })

  describe("when the runtime is desktop", () => {
    it("omits modes that are not built", () => {
      expect(offeredModes("desktop")).toEqual(["screen", "generated"])
    })
  })
})
