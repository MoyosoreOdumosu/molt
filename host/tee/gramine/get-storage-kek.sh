#!/usr/bin/env bash
set -euo pipefail

# Retrieves the 32-byte storage KEK from TPM and prints it as base64.
# This script is intended to be used by security.encryption.storageKekCommand.
#
# Required:
#   MOLTBOT_TPM2_KEK_HANDLE   persistent TPM handle (e.g. 0x81010020)
#
# Optional:
#   MOLTBOT_TPM2_KEK_AUTH                auth value
#   MOLTBOT_TPM2_KEK_AUTH_FILE           file containing auth value
#   MOLTBOT_TPM2_UNSEAL_BIN              override command path (default: tpm2_unseal)

UNSEAL_BIN="${MOLTBOT_TPM2_UNSEAL_BIN:-tpm2_unseal}"
HANDLE="${MOLTBOT_TPM2_KEK_HANDLE:-}"
AUTH="${MOLTBOT_TPM2_KEK_AUTH:-}"
AUTH_FILE="${MOLTBOT_TPM2_KEK_AUTH_FILE:-}"

if [[ -z "$HANDLE" ]]; then
  echo "MOLTBOT_TPM2_KEK_HANDLE is required" >&2
  exit 1
fi

if ! command -v "$UNSEAL_BIN" >/dev/null 2>&1; then
  echo "Missing TPM unseal binary: $UNSEAL_BIN" >&2
  exit 1
fi

tmp="$(mktemp)"
cleanup() {
  rm -f "$tmp"
}
trap cleanup EXIT

cmd=("$UNSEAL_BIN" -Q -c "$HANDLE")
if [[ -n "$AUTH_FILE" ]]; then
  cmd+=(-p "file:$AUTH_FILE")
elif [[ -n "$AUTH" ]]; then
  cmd+=(-p "$AUTH")
fi

"${cmd[@]}" > "$tmp"

python3 - "$tmp" <<'PY'
import base64
import pathlib
import sys

raw = pathlib.Path(sys.argv[1]).read_bytes()
raw_stripped = raw.strip()

key = None
if len(raw) == 32:
  key = raw
elif len(raw_stripped) == 32:
  key = raw_stripped
else:
  try:
    decoded = base64.b64decode(raw_stripped, validate=True)
    if len(decoded) == 32:
      key = decoded
  except Exception:
    key = None

if key is None:
  raise SystemExit("TPM unseal output is not a 32-byte key (raw or base64)")

sys.stdout.write(base64.b64encode(key).decode("ascii"))
PY
