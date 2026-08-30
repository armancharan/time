#!/usr/bin/env bash
# Bazel entrypoint for the Playwright media-stream contract.
# Tagged `local` so host pnpm/bazelisk/node remain reachable.
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.local/share/pnpm:${PATH}"

# Bazel injects TEST_TMPDIR / a disposable HOME which makes pnpm/corepack
# recurse forever installing itself. Prefer the real user home for caches.
REAL_HOME="$(eval echo "~$(id -un)")"
if [[ -n "${TEST_TMPDIR:-}" ]]; then
  unset TEST_TMPDIR
fi
export HOME="${REAL_HOME}"
export TMPDIR="${TMPDIR:-/tmp}"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export CI="${CI:-1}"
# Avoid Corepack re-fetching the packageManager pin into a temp home.
export COREPACK_HOME="${HOME}/.cache/node/corepack"

find_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    command -v pnpm
    return
  fi
  for candidate in \
    /opt/homebrew/bin/pnpm \
    /usr/local/bin/pnpm \
    "${HOME}/Library/pnpm/pnpm" \
    "${HOME}/.local/share/pnpm/pnpm"
  do
    if [[ -x "${candidate}" ]]; then
      echo "${candidate}"
      return
    fi
  done
  return 1
}

resolve_root() {
  if [[ -n "${BUILD_WORKSPACE_DIRECTORY:-}" && -f "${BUILD_WORKSPACE_DIRECTORY}/MODULE.bazel" ]]; then
    echo "${BUILD_WORKSPACE_DIRECTORY}"
    return
  fi

  local script="${BASH_SOURCE[0]}"
  if command -v realpath >/dev/null 2>&1; then
    script="$(realpath "${script}")"
  elif [[ -L "${script}" ]]; then
    script="$(readlink "${script}")"
  fi
  local dir
  dir="$(cd "$(dirname "${script}")" && pwd)"
  (cd "${dir}/.." && pwd)
}

ROOT="$(resolve_root)"
cd "${ROOT}"

if [[ ! -f MODULE.bazel ]]; then
  echo "Could not resolve time workspace root (got ${ROOT})" >&2
  exit 1
fi

if ! PNPM_BIN="$(find_pnpm)"; then
  echo "pnpm is required for //e2e:media_stream_e2e" >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  "${PNPM_BIN}" install --frozen-lockfile=false
fi

"${PNPM_BIN}" wasm:stage

"${PNPM_BIN}" --filter @time/web build
"${PNPM_BIN}" --filter @time/e2e exec playwright install chromium
"${PNPM_BIN}" --filter @time/e2e test
