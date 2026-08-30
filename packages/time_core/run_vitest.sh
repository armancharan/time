#!/usr/bin/env bash
# Hermetic-ish session tests for Bazel using Node 22+ type stripping (no vitest).
set -euo pipefail

find_node() {
  if [[ -n "${NODE_BIN:-}" && -x "${NODE_BIN}" ]]; then
    echo "${NODE_BIN}"
    return
  fi
  if command -v node >/dev/null 2>&1; then
    command -v node
    return
  fi
  for candidate in \
    /opt/homebrew/bin/node \
    /opt/homebrew/opt/node@24/bin/node \
    /opt/homebrew/opt/node@22/bin/node \
    /usr/local/bin/node \
    /usr/bin/node
  do
    if [[ -x "${candidate}" ]]; then
      echo "${candidate}"
      return
    fi
  done
  return 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/src/session.node-test.ts" ]]; then
  ROOT="${SCRIPT_DIR}"
elif [[ -n "${TEST_SRCDIR:-}" && -f "${TEST_SRCDIR}/_main/packages/time_core/src/session.node-test.ts" ]]; then
  ROOT="${TEST_SRCDIR}/_main/packages/time_core"
else
  ROOT="${SCRIPT_DIR}"
fi

cd "${ROOT}"

if ! NODE_BIN="$(find_node)"; then
  echo "node is required for //packages/time_core:tests" >&2
  exit 1
fi

exec "${NODE_BIN}" --experimental-strip-types --test src/session.node-test.ts
