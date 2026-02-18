#!/usr/bin/env bash
set -euo pipefail

IPFS_BIN="${MOLTBOT_IPFS_BIN:-/usr/local/bin/ipfs}"
IPFS_PATH="${IPFS_PATH:-$HOME/.ipfs}"

if [[ ! -x "$IPFS_BIN" ]]; then
  echo "IPFS binary not found at $IPFS_BIN" >&2
  exit 1
fi

if [[ -z "${HOME:-}" ]]; then
  echo "HOME is not set for IPFS prestart." >&2
  exit 1
fi

if [[ ! -f "$IPFS_PATH/config" ]]; then
  mkdir -p "$IPFS_PATH"
  "$IPFS_BIN" init --profile=server
fi

