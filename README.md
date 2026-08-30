# time

A monument, to the concept, that is.

A work timer that keeps this tab awake while it runs. Glance the elapsed
time in the tab, optionally keep a local session log.

Lineage: [tabawake](https://github.com/armancharan/tabawake).

## Quick start

```bash
# Tooling
brew install bazelisk   # or use the CI setup-bazel action
corepack enable && corepack prepare pnpm@9 --activate

pnpm install
pnpm dev                # stages WASM, then http://127.0.0.1:5173
```

## Scripts

| Command | What |
|---|---|
| `bazelisk build //crates/frame_engine:frame_engine_web` | WASM package via custom rule |
| `bazelisk test //crates/frame_engine:frame_engine_test` | Rust frame tests |
| `bazelisk test //e2e:media_stream_e2e` | Same e2e through Bazel |
| `pnpm build` | Production web build |
| `pnpm dev` | Vite web UI |
| `pnpm test` | Core + web unit tests (stages WASM for the web suite) |
| `pnpm test:e2e` | Playwright media-stream contract |
| `pnpm wasm:stage` | Build `//crates/frame_engine:frame_engine_web` and stage artifacts |

## Layout

```text
apps/web                 UI + drivers
crates/frame_engine      Rust RGBA painter (+ WASM)
docs/ARCHITECTURE.md     deeper design notes
e2e                      Playwright contract
packages/time_core       session state machine
tools/rules              media_stream_e2e, wasm_frame_engine
```

## License

MIT
