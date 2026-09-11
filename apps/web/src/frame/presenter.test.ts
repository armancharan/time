import { describe, expect, it, vi } from "vitest"
import type { FrameEngine } from "./engine"
import { createTimerController } from "./presenter"

function mockEngine(): FrameEngine {
  return {
    renderFrame: vi.fn((_w: number, _h: number, tMs: number, _fidelity: number) => {
      // Tiny valid RGBA buffer; sink tests cover putImageData sizing.
      const bytes = new Uint8Array(4)
      bytes[0] = tMs & 0xff
      return bytes
    }),
  }
}

describe("createTimerController", () => {
  it("reset paints 00:00 and clears elapsedMs", async () => {
    const canvas = document.createElement("canvas")
    const ctx = {
      putImageData: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    }
    vi.spyOn(canvas, "getContext").mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    )

    const engine = mockEngine()
    const timer = await createTimerController(canvas, {
      engine,
      initialMs: 12_500,
    })
    expect(timer.elapsedMs).toBe(12_500)
    expect(engine.renderFrame).toHaveBeenCalledWith(320, 200, 12_500, 0)

    await timer.play(12_500)
    expect(timer.playing).toBe(true)

    timer.reset()
    expect(timer.playing).toBe(false)
    expect(timer.paused).toBe(false)
    expect(timer.elapsedMs).toBe(0)
    expect(engine.renderFrame).toHaveBeenCalledWith(320, 200, 0, 0)

    timer.dispose()
  })

  it("elapsedMs advances while playing", async () => {
    vi.useFakeTimers()
    const canvas = document.createElement("canvas")
    vi.spyOn(canvas, "getContext").mockReturnValue({
      putImageData: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)

    const timer = await createTimerController(canvas, {
      engine: mockEngine(),
      initialMs: 1_000,
    })
    await timer.play(1_000)
    expect(timer.elapsedMs).toBe(1_000)

    vi.advanceTimersByTime(250)
    expect(timer.elapsedMs).toBeGreaterThanOrEqual(1_250)

    timer.dispose()
    vi.useRealTimers()
  })

  it("reset keeps elapsed at 00:00 after later animation frames", async () => {
    vi.useFakeTimers()
    const canvas = document.createElement("canvas")
    vi.spyOn(canvas, "getContext").mockReturnValue({
      putImageData: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)

    const engine = mockEngine()
    const timer = await createTimerController(canvas, {
      engine,
      initialMs: 5_000,
    })
    await timer.play(5_000)
    vi.advanceTimersByTime(400)
    expect(timer.elapsedMs).toBeGreaterThanOrEqual(5_400)

    timer.reset()
    expect(timer.elapsedMs).toBe(0)
    expect(timer.playing).toBe(false)

    vi.advanceTimersByTime(500)
    expect(timer.elapsedMs).toBe(0)
    expect(engine.renderFrame).toHaveBeenLastCalledWith(320, 200, 0, 0)

    timer.dispose()
    vi.useRealTimers()
  })

  it("setFidelity repaints the current time at the new resolution", async () => {
    const canvas = document.createElement("canvas")
    vi.spyOn(canvas, "getContext").mockReturnValue({
      putImageData: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)

    const engine = mockEngine()
    const timer = await createTimerController(canvas, {
      engine,
      initialMs: 1_234,
    })
    expect(timer.fidelity).toBe("seconds")
    expect(engine.renderFrame).toHaveBeenLastCalledWith(320, 200, 1_234, 0)

    timer.setFidelity("milliseconds")
    expect(timer.fidelity).toBe("milliseconds")
    expect(engine.renderFrame).toHaveBeenLastCalledWith(320, 200, 1_234, 1)

    timer.dispose()
  })

  it("countdown paints remaining time and exhausts at zero", async () => {
    const canvas = document.createElement("canvas")
    vi.spyOn(canvas, "getContext").mockReturnValue({
      putImageData: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)

    const engine = mockEngine()
    const onExhausted = vi.fn()
    const timer = await createTimerController(canvas, {
      engine,
      initialMs: 2_000,
      countdownFromMs: 10_000,
      onExhausted,
    })
    expect(timer.elapsedMs).toBe(2_000)
    expect(timer.displayedMs).toBe(8_000)
    expect(engine.renderFrame).toHaveBeenLastCalledWith(320, 200, 8_000, 0)

    await timer.play(10_000)
    expect(timer.playing).toBe(false)
    expect(timer.displayedMs).toBe(0)
    expect(onExhausted).toHaveBeenCalledTimes(1)

    timer.dispose()
  })

  it("count up to paints elapsed and exhausts at the duration", async () => {
    const canvas = document.createElement("canvas")
    vi.spyOn(canvas, "getContext").mockReturnValue({
      putImageData: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)

    const engine = mockEngine()
    const onExhausted = vi.fn()
    const timer = await createTimerController(canvas, {
      engine,
      initialMs: 2_000,
      countUpToMs: 10_000,
      onExhausted,
    })
    expect(timer.elapsedMs).toBe(2_000)
    expect(timer.displayedMs).toBe(2_000)
    expect(engine.renderFrame).toHaveBeenLastCalledWith(320, 200, 2_000, 0)

    await timer.play(10_000)
    expect(timer.playing).toBe(false)
    expect(timer.displayedMs).toBe(10_000)
    expect(onExhausted).toHaveBeenCalledTimes(1)

    timer.dispose()
  })
})
