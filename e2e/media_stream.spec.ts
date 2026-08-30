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
    await expect(page.getByText("Track sessions on this machine")).toBeVisible()
    await expect(page.getByText("Tracking is off.")).toBeVisible()
    await expect(page).toHaveTitle("time")
    await expect(page.getByTestId("status")).toContainText("Ready")
    await expect(page.getByRole("radio", { name: /Video/i })).toBeChecked()
    await expect(page.getByRole("radio", { name: /^Seconds/ })).toBeChecked()
    await expect(page.getByTestId("preview-video")).toBeVisible()
  })

  test("document title tracks elapsed time", async ({ page }) => {
    await stubWakeLock(page)
    await page.goto("/")
    await expect(page).toHaveTitle("time")

    await page.getByRole("button", { name: "Start" }).click()
    await expect(page.getByTestId("status")).toContainText("On", {
      timeout: 15_000,
    })
    await expect(page).toHaveTitle(/^\d{1,2}:\d{2}:\d{2} · time$/)

    const runningTitle = await page.title()
    await expect
      .poll(async () => page.title(), { timeout: 4_000 })
      .not.toBe(runningTitle)

    await page.getByRole("button", { name: "Pause" }).click()
    await expect(page.getByTestId("status")).toContainText("Paused")
    const pausedTitle = await page.title()
    expect(pausedTitle).toMatch(/^\d{1,2}:\d{2}:\d{2} · time$/)
    await page.waitForTimeout(1_200)
    expect(await page.title()).toBe(pausedTitle)

    await page.getByRole("button", { name: "Reset" }).click()
    await expect(page).toHaveTitle("time")

    await page.getByRole("radio", { name: /Milliseconds/i }).click()
    await page.getByRole("button", { name: "Start" }).click()
    await expect(page.getByTestId("status")).toContainText("On", {
      timeout: 15_000,
    })
    await expect(page).toHaveTitle(/^\d{1,2}:\d{2}:\d{2}\.\d{3} · time$/)
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

    await page.getByRole("button", { name: "Pause" }).click()
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
})
