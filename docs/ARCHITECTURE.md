# Architecture

time is a work timer: glanceable elapsed time, optional local session log,
and honest web stay-awake plus an artisan Rust→WASM→`<video>` media pipeline,
packaged with Bazel custom rules. Ancestry is [tabawake](https://github.com/armancharan/tabawake).

## Runtime graph

```text
UI (apps/web)
  → time_core session state machine
    → capability adapter / drivers
        → WakeLockDriver          (navigator.wakeLock)
        → GeneratedMediaDriver   (Rust WASM frames → MediaStream → <video>)
```

Desktop modes (`system`, `presence`) are declared in the capability matrix as
**unsupported on web** and reserved for a later Tauri shell.

## Honest product limit

The web surface keeps the **screen awake while the tab is visible**.
It does not claim OS sleep inhibition after the tab is backgrounded.

## Custom Bazel rules

### `wasm_frame_engine` (`tools/rules/wasm_frame_engine.bzl`)

Wraps `rust_shared_library` (wasm32) + `rust_wasm_bindgen` (`target = "web"`)
so the procedural frame crate becomes one label the web app and e2e can depend on:

```text
//crates/frame_engine:frame_engine_web
```

Stage into Vite with:

```bash
pnpm wasm:stage   # → apps/web/src/generated/frame_engine.js + frame_engine_bg.wasm
```

### `media_stream_e2e` (`tools/rules/media_stream_e2e.bzl`)

Hermetic-ish Playwright contract: build web, serve preview, assert that
**Start** in `generated` mode attaches a `MediaStream` to `<video>`.

```text
bazelisk test //e2e:media_stream_e2e
```

(Requires local `pnpm` + Chromium; CI installs both.)

## Domain (`packages/time_core`)

States: `idle → armed → active → paused → error`

Modes: `screen | generated | system | presence`

Pure TS. Vitest covers legal/illegal transitions for local DX; Bazel runs the
same behaviours via Node 22 `--experimental-strip-types` + `node:test`
(`src/session.node-test.ts`) so `//packages/time_core:tests` stays free of
a pnpm sandbox.

## Frame engine (`crates/frame_engine`)

`render_frame(width, height, t_ms) -> RGBA8` (`H:MM:SS`); WASM `renderFrame` also takes a fidelity flag for `H:MM:SS.mmm`. Hours wrap at 100.

Host `rust_test` covers buffer sizing and motion. WASM exports
`renderFrame` / `frameByteLen` for the browser driver.

## Media bridge

Polymorphic frame pipeline (`apps/web/src/frame`):

1. **Engine** — Rust/WASM `renderFrame` only (no JS painter for the live clock).
2. **Sink** — `createFrameSink(host)` returns a `FrameSink` for
   `HTMLCanvasElement` (Screen mode) or `HTMLVideoElement` (Video mode).
3. **Presenter** — `createTimerController`: idle paints static `00:00` (no rAF);
   `play` / `pause` / `reset` advance, freeze at arbitrary elapsed ms, or return to zero.
   Video sinks heartbeat a frozen frame while paused so media stay-awake still holds.

Screen stay-awake uses the Wake Lock API beside the canvas preview.
Video stay-awake uses the playing `<video>` MediaStream.

The document title mirrors the clock (`H:MM:SS` / `H:MM:SS.mmm · time`) by
polling `elapsedMs` on an interval, so the tab label still advances when rAF
is background-throttled. Idle and reset restore `time`.

## Pins

| Tool | Version |
|---|---|
| Bazel | `.bazelversion` → 9.2.0 |
| rules_rust | 0.73.0 |
| rules_rust_wasm_bindgen | 0.73.0 |
| Node (CI) | 22 |
| pnpm | 9 |

## Out of scope (v1)

- Tauri / OS power assertions / input nudges
- Nix / Dagger
- Remote Bazel cache
- MSE / WebCodecs encode pipeline
