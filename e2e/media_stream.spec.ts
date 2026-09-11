import { expect, test, type Page } from "@playwright/test"

/** Headless Chromium often lacks Wake Lock — stub so Screen mode is testable. */
async function stubWakeLock(page: Page) {
  await page.addInitScript(() => {
    const sentinel = {
      released: false,
      addEventListener() {
        /* noop */
      },
      removeEventListener() {
        /* noop */
      },
      async release() {
        this.released = true
      },
    }
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: async () => sentinel,
      },
    })
  })
}

test.describe("time", () => {
  test("brand and timer idle", async ({ page }) => {
    await stubWakeLock(page)
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "time" })).toBeVisible()
    await expect(page.getByText("a monument,")).toBeVisible()
    await expect(page.getByText("to the concept,")).toBeVisible()
    await expect(page.getByText("that is")).toBeVisible()
    await expect(page.getByRole("heading", { name: "History" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Keep screen awake" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Mechanism" })).toBeVisible()
    await expect(page.getByText("Track sessions on this machine")).toBeVisible()
    await expect(page.getByText("No sessions yet.")).toBeVisible()
    await expect(page).toHaveTitle("time")
    await expect(page.getByTestId("status")).toContainText("Ready")
    await expect(page.getByRole("radio", { name: /Video/i })).toBeChecked()
    await expect(page.getByRole("radio", { name: /^Seconds/ })).toBeChecked()
    await expect(page.getByTestId("preview-video")).toBeVisible()
    await expect(page.getByRole("button", { name: "Start" })).toBeEnabled()
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeDisabled()
    await expect(page.getByRole("button", { name: "Reset" })).toBeDisabled()
  })

  test("document title tracks elapsed time", async ({ page }) => {
    await stubWakeLock(page)
    await page.goto("/")
    await expect(page).toHaveTitle("time")

    await page.getByRole("button", { name: "Start" }).click()
    await expect(page.getByTestId("status")).toContainText("On", {
      timeout: 15_000,
    })
    await expect(page).toHaveTitle(/^\d{2,4}:\d{2}:\d{2} · time$/)

    const runningTitle = await page.title()
    await expect
      .poll(async () => page.title(), { timeout: 4_000 })
      .not.toBe(runningTitle)

    await page.getByRole("button", { name: "Pause", exact: true }).click()
    await expect(page.getByTestId("status")).toContainText("Paused")
    const pausedTitle = await page.title()
    expect(pausedTitle).toMatch(/^\d{2,4}:\d{2}:\d{2} · time$/)
    await page.waitForTimeout(1_200)
    expect(await page.title()).toBe(pausedTitle)

    await page.getByRole("button", { name: "Reset" }).click()
    await expect(page).toHaveTitle("time")

    await page.getByRole("radio", { name: /Milliseconds/i }).click()
    await page.getByRole("button", { name: "Start" }).click()
    await expect(page.getByTestId("status")).toContainText("On", {
      timeout: 15_000,
    })
    await expect(page).toHaveTitle(/^\d{2,4}:\d{2}:\d{2}\.\d{3} · time$/)
  })

  test("play pause stop then Screen ↔ Video", async ({ page }) => {
    await stubWakeLock(page)
    await page.goto("/")

    await page.getByRole("button", { name: "Start" }).click()
    await expect(page.getByTestId("status")).toContainText("On", {
      timeout: 15_000,
    })

    const hasStream = await page.getByTestId("preview-video").evaluate((node) => {
      const video = node as HTMLVideoElement
      return Boolean(video.srcObject && video.srcObject instanceof MediaStream)
    })
    expect(hasStream).toBe(true)

    await page.getByRole("button", { name: "Pause", exact: true }).click()
    await expect(page.getByTestId("status")).toContainText("Paused")
    await expect(page.getByRole("button", { name: "Resume" })).toBeVisible()

    await page.getByRole("button", { name: "Resume" }).click()
    await expect(page.getByTestId("status")).toContainText("On")

    await page.getByRole("button", { name: "Reset" }).click()
    await expect(page.getByTestId("status")).toContainText("Reset · Video")
    await expect(page.locator("[data-ref=stage]")).toHaveAttribute(
      "data-elapsed-ms",
      "0",
    )

    await page.getByRole("radio", { name: /Milliseconds/i }).click()
    await expect(page.getByRole("radio", { name: /Milliseconds/i })).toBeChecked()
    await expect(page.getByRole("radio", { name: /^Seconds/ })).not.toBeChecked()

    await page.getByRole("radio", { name: /Screen/i }).click()
    await expect(page.getByTestId("preview-canvas")).toBeVisible()
    await expect(page.getByTestId("preview-video")).toBeHidden()

    await page.getByRole("radio", { name: /Video/i }).click()
    await expect(page.getByTestId("preview-video")).toBeVisible()
    await expect(page.getByTestId("preview-canvas")).toBeHidden()
    await expect(page.getByRole("radio", { name: /Video/i })).toBeChecked()
    await expect(page.getByRole("radio", { name: /Screen/i })).toBeEnabled()
  })

  test("swap Screen ↔ Video while Start is on", async ({ page }) => {
    await stubWakeLock(page)
    await page.goto("/")
    await page.getByRole("button", { name: "Start" }).click()
    await expect(page.getByTestId("status")).toContainText("On · Video", {
      timeout: 15_000,
    })

    await page.getByRole("radio", { name: /Screen/i }).click()
    await expect(page.getByTestId("preview-canvas")).toBeVisible()
    await expect(page.getByTestId("status")).toContainText("On · Screen Wake Lock")
    await expect(page.getByRole("button", { name: "Reset" })).toBeVisible()

    await page.getByRole("radio", { name: /Video/i }).click()
    await expect(page.getByTestId("preview-video")).toBeVisible()
    await expect(page.getByTestId("status")).toContainText("On · Video")

    const hasStream = await page.getByTestId("preview-video").evaluate((node) => {
      const video = node as HTMLVideoElement
      return Boolean(video.srcObject && video.srcObject instanceof MediaStream)
    })
    expect(hasStream).toBe(true)
  })

  test("keep screen awake can be turned off", async ({ page }) => {
    await stubWakeLock(page)
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "Mechanism" })).toBeVisible()

    await page.getByRole("switch", { name: "Keep screen awake" }).click()
    await expect(page.getByRole("heading", { name: "Mechanism" })).toBeHidden()
    await expect(page.getByText("The display may sleep.")).toBeVisible()
    await expect(page.getByTestId("preview-canvas")).toBeVisible()
    await expect(page.getByTestId("preview-video")).toBeHidden()

    await page.getByRole("button", { name: "Start" }).click()
    await expect(page.getByTestId("status")).toContainText("On", {
      timeout: 15_000,
    })
    await expect(page.getByTestId("status")).not.toContainText("Video")
    await expect(page).toHaveTitle(/^\d{2,4}:\d{2}:\d{2} · time$/)
  })

  test("session history records a completed run", async ({ page }) => {
    await stubWakeLock(page)
    await page.goto("/")
    await expect(page.getByText("No sessions yet.")).toBeVisible()

    await page.getByRole("button", { name: "Start" }).click()
    await expect(page.getByTestId("status")).toContainText("On", {
      timeout: 15_000,
    })
    await expect
      .poll(async () => page.title(), { timeout: 4_000 })
      .not.toBe("time")

    await page.getByRole("button", { name: "Reset" }).click()
    await expect(page.locator(".history-row")).toHaveCount(1)
    await expect(page.locator(".history-segment")).toHaveCount(0)
    await expect(page.locator(".history-row")).toHaveAttribute("data-kind", "elapsed")
    await expect(page.locator(".history-kind")).toHaveText("→")
    await expect(page.locator(".history-row")).not.toContainText("Video")
    await expect(page.locator(".history-row")).toContainText("–")
    await expect(page.getByRole("button", { name: "Clear", exact: true })).toBeVisible()
  })

  test("pause with tracker records the stretch and resumes a new one", async ({
    page,
  }) => {
    await stubWakeLock(page)
    await page.goto("/")

    await page.getByRole("button", { name: "Start" }).click()
    await expect(page.getByTestId("status")).toContainText("On", {
      timeout: 15_000,
    })
    await expect
      .poll(async () => page.title(), { timeout: 4_000 })
      .not.toBe("time")

    await page.getByRole("button", { name: "Pause", exact: true }).hover()
    await page.getByRole("button", { name: "Pause with tracker" }).click()
    await expect(page.getByTestId("status")).toContainText("Paused")
    await expect(page.locator(".history-row")).toHaveCount(1)
    await expect(page.locator(".history-segment")).toHaveCount(1)
    const pausedTitle = await page.title()

    await page.getByRole("button", { name: "Resume" }).click()
    await expect(page.getByTestId("status")).toContainText("On")
    await expect
      .poll(async () => page.title(), { timeout: 4_000 })
      .not.toBe(pausedTitle)
    await page.getByRole("button", { name: "Reset" }).click()
    await expect(page.locator(".history-row")).toHaveCount(1)
    await expect(page.locator(".history-segment")).toHaveCount(2)
  })

  test("pause with tracker explains when tracking is off", async ({ page }) => {
    await stubWakeLock(page)
    await page.goto("/")
    await page.getByRole("switch", { name: "Track sessions on this machine" }).click()

    await page.getByRole("button", { name: "Start" }).click()
    await expect(page.getByTestId("status")).toContainText("On", {
      timeout: 15_000,
    })

    await page.getByRole("button", { name: "Pause", exact: true }).hover()
    const pauseTrack = page.getByRole("button", { name: "Pause with tracker" })
    await expect(pauseTrack).toBeDisabled()
    await pauseTrack.hover({ force: true })
    const enable = page.getByRole("button", { name: "Enable History" })
    await expect(enable).toBeVisible()
    await enable.click()
    await expect(page.getByRole("button", { name: "Pause with tracker" })).toBeEnabled()
  })

  test("countdown from Start counts remaining time", async ({ page }) => {
    await stubWakeLock(page)
    await page.goto("/")

    await page.getByRole("button", { name: "Start" }).hover()
    await expect(page.getByRole("button", { name: "Countdown from" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Count up to" })).toBeVisible()
    await expect(page.getByLabel("Countdown duration")).toHaveValue("")
    await expect(page.getByLabel("Countdown duration")).toHaveAttribute(
      "placeholder",
      "00:00",
    )
    await expect(page.getByLabel("Count up to duration")).toHaveAttribute(
      "placeholder",
      "00:00",
    )
    await page.getByLabel("Countdown duration").fill("25:00")
    await page.getByRole("button", { name: "Countdown from" }).click()
    await expect(page.getByTestId("status")).toContainText("On", {
      timeout: 15_000,
    })
    await expect(page.locator("[data-ref=limit-note]")).toHaveText(
      "Countdown from 00:25:00",
    )
    await expect(page).toHaveTitle(/^00:2[0-5]:\d{2} · time$/)
    await page.getByRole("button", { name: "Reset" }).click()
    await expect(page).toHaveTitle("time")
    await expect(page.locator("[data-ref=limit-note]")).toBeHidden()
    await expect(page.locator(".history-row")).toHaveAttribute(
      "data-kind",
      "countdown-from",
    )
    await expect(page.locator(".history-kind")).toHaveText("↓")
  })

  test("count up to Start names the cap", async ({ page }) => {
    await stubWakeLock(page)
    await page.goto("/")

    await page.getByRole("button", { name: "Start" }).hover()
    await page.getByLabel("Count up to duration").fill("25:00")
    await page.getByRole("button", { name: "Count up to" }).click()
    await expect(page.getByTestId("status")).toContainText("On", {
      timeout: 15_000,
    })
    await expect(page.locator("[data-ref=limit-note]")).toHaveText(
      "Count up to 00:25:00",
    )
    await page.getByRole("button", { name: "Reset" }).click()
    await expect(page.locator("[data-ref=limit-note]")).toBeHidden()
    await expect(page.locator(".history-row")).toHaveAttribute(
      "data-kind",
      "count-up-to",
    )
    await expect(page.locator(".history-kind")).toHaveText("↑")
  })

  test("countdown and count-up errors clear when Start hover ends", async ({
    page,
  }) => {
    await stubWakeLock(page)
    await page.goto("/")

    await page.getByRole("button", { name: "Start" }).hover()
    await page.getByRole("button", { name: "Countdown from" }).click()
    await expect(page.getByLabel("Countdown duration")).toHaveAttribute(
      "aria-invalid",
      "true",
    )

    await page.getByRole("button", { name: "Pause", exact: true }).hover()
    await expect(page.getByLabel("Countdown duration")).not.toHaveAttribute(
      "aria-invalid",
      "true",
    )

    await page.getByRole("button", { name: "Start" }).hover()
    await page.getByRole("button", { name: "Count up to" }).click()
    await expect(page.getByLabel("Count up to duration")).toHaveAttribute(
      "aria-invalid",
      "true",
    )

    await page.getByRole("button", { name: "Pause", exact: true }).hover()
    await expect(page.getByLabel("Count up to duration")).not.toHaveAttribute(
      "aria-invalid",
      "true",
    )
  })
})
