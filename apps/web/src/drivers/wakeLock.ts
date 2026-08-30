import type { AppRuntime, StopReason } from "@time/core"

export interface DriverSession {
  stop: (reason: StopReason) => Promise<void>
}

export type WakeLockFailureKind =
  | "driver_error"
  | "permission_denied"
  | "unsupported"

/** True when the Screen Wake Lock API exists on this page. */
export function wakeLockSupported(
  nav: Pick<Navigator, "wakeLock"> | Navigator = navigator,
): boolean {
  return "wakeLock" in nav && nav.wakeLock != null
}

/** Map a thrown wake-lock failure to a stable kind for UI + tests. */
export function classifyWakeLockError(
  err: unknown,
  apiPresent: boolean,
): WakeLockFailureKind {
  if (!apiPresent) return "unsupported"
  if (err && typeof err === "object" && "reason" in err) {
    const reason = (err as { reason: StopReason }).reason
    if (reason === "unsupported") return "unsupported"
    if (reason === "permission_denied") return "permission_denied"
  }
  if (err instanceof DOMException && err.name === "NotAllowedError") {
    return "permission_denied"
  }
  return "driver_error"
}

/** User-facing copy for Screen Wake Lock failures. */
export function wakeLockUserMessage(
  kind: WakeLockFailureKind,
  runtime: AppRuntime = "web",
): string {
  switch (kind) {
    case "driver_error":
      return "Couldn’t start Screen lock. Try again, or use Video."
    case "permission_denied":
      return runtime === "desktop"
        ? "The window blocked Screen lock. Allow wake lock, then try again — or use Video."
        : "Browser blocked Screen lock. Allow wake lock for this site, then try again — or use Video."
    case "unsupported":
      return runtime === "desktop"
        ? "Not available in this window. Use Video."
        : "Not available in this browser. Use Video."
  }
}

export function wakeLockErrorMessage(
  err: unknown,
  apiPresent = wakeLockSupported(),
  runtime: AppRuntime = "web",
): string {
  return wakeLockUserMessage(classifyWakeLockError(err, apiPresent), runtime)
}

/**
 * Primary keep-awake path: Screen Wake Lock API with visibility re-acquire.
 */
export async function startWakeLockDriver(
  onRelease: (reason: StopReason) => void,
): Promise<DriverSession> {
  if (!wakeLockSupported()) {
    throw Object.assign(new Error("Screen Wake Lock API unavailable"), {
      reason: "unsupported" as StopReason,
    })
  }

  let sentinel: WakeLockSentinel | null = null
  let stopped = false

  const acquire = async () => {
    try {
      sentinel = await navigator.wakeLock.request("screen")
      sentinel.addEventListener("release", () => {
        if (!stopped) onRelease("visibility_loss")
      })
    } catch (err) {
      const reason: StopReason =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "permission_denied"
          : "driver_error"
      throw Object.assign(
        err instanceof Error ? err : new Error(String(err)),
        { reason },
      )
    }
  }

  await acquire()

  const onVisibility = async () => {
    if (stopped || document.visibilityState !== "visible") return
    if (sentinel && !sentinel.released) return
    try {
      await acquire()
    } catch {
      onRelease("permission_denied")
    }
  }
  document.addEventListener("visibilitychange", onVisibility)

  return {
    stop: async (reason) => {
      stopped = true
      document.removeEventListener("visibilitychange", onVisibility)
      try {
        await sentinel?.release()
      } catch {
        /* ignore */
      }
      sentinel = null
      void reason
    },
  }
}
