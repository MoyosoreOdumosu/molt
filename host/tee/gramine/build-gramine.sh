#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
GRAMINE_DIR="$(cd "$(dirname "$0")" && pwd)"

BIN_SRC="$ROOT_DIR/releases/moltbot-host"
BIN_DST="$GRAMINE_DIR/moltbot-host"

if [[ ! -f "$BIN_SRC" ]]; then
  echo "Missing binary at $BIN_SRC"
  exit 1
fi

cp "$BIN_SRC" "$BIN_DST"

if ! command -v gramine-manifest >/dev/null 2>&1; then
  echo "gramine-manifest not found"
  exit 1
fi

gramine-manifest -Dlog_level=error "$GRAMINE_DIR/moltbot.manifest.template" > "$GRAMINE_DIR/moltbot.manifest"
gramine-sgx-sign --manifest "$GRAMINE_DIR/moltbot.manifest" --output "$GRAMINE_DIR/moltbot.manifest.sgx"

echo "Gramine SGX manifest generated in $GRAMINE_DIR"
