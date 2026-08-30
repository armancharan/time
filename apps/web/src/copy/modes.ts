import type { AppRuntime, KeepAwakeMode } from "@time/core"

export const SCREEN_WAKE_LOCK_MDN =
  "https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API"

export const MEDIA_STREAM_MDN =
  "https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_API"

export type ModeCopy = {
  blurbHtml: string
  label: string
}

const docsLink = (href: string, label: string) =>
  `<a class="mode-docs" href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`

const canvas = `<code class="mode-code">&lt;canvas /&gt;</code>`
const video = `<code class="mode-code">&lt;video /&gt;</code>`

const WEB: Record<KeepAwakeMode, ModeCopy> = {
  generated: {
    label: "Video",
    blurbHtml: `Uses the browser’s ${docsLink(MEDIA_STREAM_MDN, "MediaStream API")} to keep this display awake. Timer plays through a ${video}.`,
  },
  presence: {
    label: "Presence",
    blurbHtml: "",
  },
  screen: {
    label: "Screen Wake Lock",
    blurbHtml: `Uses the browser’s ${docsLink(SCREEN_WAKE_LOCK_MDN, "Screen Wake Lock API")} to keep this display on. Timer draws on a ${canvas}.`,
  },
  system: {
    label: "System",
    blurbHtml: "",
  },
}

const DESKTOP: Record<KeepAwakeMode, ModeCopy> = {
  generated: {
    label: "Video",
    blurbHtml: `Uses the webview’s ${docsLink(MEDIA_STREAM_MDN, "MediaStream API")} to keep this display awake. Timer plays through a ${video}.`,
  },
  presence: {
    label: "Presence",
    blurbHtml: "",
  },
  screen: {
    label: "Screen Wake Lock",
    blurbHtml: `Uses the webview’s ${docsLink(SCREEN_WAKE_LOCK_MDN, "Screen Wake Lock API")} to keep this display on. Timer draws on a ${canvas}.`,
  },
  system: {
    label: "System",
    blurbHtml: "",
  },
}

export function modeCopy(runtime: AppRuntime, mode: KeepAwakeMode): ModeCopy {
  switch (runtime) {
    case "desktop":
      return DESKTOP[mode]
    case "web":
      return WEB[mode]
    default: {
      const _exhaustive: never = runtime
      return _exhaustive
    }
  }
}
