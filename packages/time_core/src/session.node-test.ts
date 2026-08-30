/**
 * Hermetic Node test for Bazel (`node --experimental-strip-types --test`).
 * Mirrors the vitest suite without pulling vitest into the sandbox.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  capabilityFor,
  desktopCapability,
  initialSession,
  offeredModes,
  reduceSession,
  webCapability,
  type SessionSnapshot,
} from "./session.ts"

describe("reduceSession", () => {
  it("arms from idle", () => {
    const next = reduceSession(initialSession(), {
      type: "ARM",
      mode: "generated",
    })
    assert.equal(next.state, "armed")
    assert.equal(next.mode, "generated")
  })

  it("starts from armed", () => {
    const armed = reduceSession(initialSession(), {
      type: "ARM",
      mode: "screen",
    })
    const active = reduceSession(armed, { type: "START" }, 1_700_000_000_000)
    assert.equal(active.state, "active")
    assert.equal(active.startedAt, 1_700_000_000_000)
  })

  it("ignores illegal start from idle", () => {
    const snap = initialSession()
    assert.deepEqual(reduceSession(snap, { type: "START" }), snap)
  })

  it("pauses and resumes", () => {
    let snap: SessionSnapshot = initialSession()
    snap = reduceSession(snap, { type: "ARM", mode: "screen" })
    snap = reduceSession(snap, { type: "START" }, 10)
    snap = reduceSession(snap, { type: "PAUSE", reason: "visibility_loss" })
    assert.equal(snap.state, "paused")
    assert.equal(snap.lastReason, "visibility_loss")
    snap = reduceSession(snap, { type: "RESUME" })
    assert.equal(snap.state, "active")
  })

  it("stops back to idle", () => {
    let snap = initialSession()
    snap = reduceSession(snap, { type: "ARM", mode: "generated" })
    snap = reduceSession(snap, { type: "START" }, 10)
    snap = reduceSession(snap, { type: "STOP", reason: "user" })
    assert.equal(snap.state, "idle")
    assert.equal(snap.mode, null)
    assert.equal(snap.lastReason, "user")
    assert.equal(snap.startedAt, null)
  })

  it("fails into error", () => {
    let snap = initialSession()
    snap = reduceSession(snap, { type: "ARM", mode: "screen" })
    snap = reduceSession(snap, {
      type: "FAIL",
      reason: "permission_denied",
      message: "Wake Lock denied",
    })
    assert.equal(snap.state, "error")
    assert.equal(snap.message, "Wake Lock denied")
  })

  it("switches mode while active and ignores switch from idle", () => {
    let snap = initialSession()
    assert.deepEqual(
      reduceSession(snap, { type: "SWITCH_MODE", mode: "screen" }),
      snap,
    )
    snap = reduceSession(snap, { type: "ARM", mode: "generated" })
    snap = reduceSession(snap, { type: "START" }, 10)
    snap = reduceSession(snap, { type: "SWITCH_MODE", mode: "screen" })
    assert.equal(snap.state, "active")
    assert.equal(snap.mode, "screen")
    assert.equal(snap.startedAt, 10)
    snap = reduceSession(snap, { type: "PAUSE", reason: "paused" })
    snap = reduceSession(snap, { type: "SWITCH_MODE", mode: "generated" })
    assert.equal(snap.state, "paused")
    assert.equal(snap.mode, "generated")
  })
})

describe("webCapability", () => {
  it("marks desktop-only modes unsupported", () => {
    assert.equal(webCapability("generated"), "supported")
    assert.equal(webCapability("presence"), "unsupported")
    assert.equal(webCapability("screen"), "supported")
    assert.equal(webCapability("system"), "unsupported")
  })
})

describe("desktopCapability", () => {
  it("supports screen and video and withholds what is not built", () => {
    assert.equal(desktopCapability("generated"), "supported")
    assert.equal(desktopCapability("presence"), "unsupported")
    assert.equal(desktopCapability("screen"), "supported")
    assert.equal(desktopCapability("system"), "unsupported")
  })
})

describe("capabilityFor", () => {
  it("selects the matrix by runtime", () => {
    assert.equal(capabilityFor("web", "system"), "unsupported")
    assert.equal(capabilityFor("desktop", "system"), "unsupported")
    assert.equal(capabilityFor("desktop", "presence"), "unsupported")
  })
})

describe("offeredModes", () => {
  describe("when the runtime is web", () => {
    it("omits unsupported modes", () => {
      assert.deepEqual(offeredModes("web"), ["screen", "generated"])
    })
  })

  describe("when the runtime is desktop", () => {
    it("omits modes that are not built", () => {
      assert.deepEqual(offeredModes("desktop"), ["screen", "generated"])
    })
  })
})
