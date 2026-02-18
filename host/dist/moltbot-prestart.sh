#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${MOLTBOT_INSTALL_DIR:-/opt/moltbot}"
ENV_FILE="${MOLTBOT_ENV_FILE:-/etc/moltbot/moltbot.env}"
CONFIG_FILE="${MOLTBOT_CONFIG_FILE:-$INSTALL_DIR/config.json}"
ATTESTATION_FILE="${MOLTBOT_ATTESTATION_FILE:-$INSTALL_DIR/tee/gramine/attestation.json}"
ATTESTATION_GENERATOR="${MOLTBOT_ATTESTATION_GENERATOR:-$INSTALL_DIR/tee/gramine/generate-attestation.sh}"
ATTESTATION_VERIFY="${MOLTBOT_ATTESTATION_VERIFY:-$INSTALL_DIR/tee/gramine/verify-attestation.sh}"
DEFAULT_KEK_COMMAND="${MOLTBOT_DEFAULT_KEK_COMMAND:-$INSTALL_DIR/tee/gramine/get-storage-kek.sh}"

is_valid_kek() {
  python3 - "$1" <<'PY'
import base64,sys
try:
    data=base64.b64decode(sys.argv[1], validate=True)
    raise SystemExit(0 if len(data)==32 else 1)
except Exception:
    raise SystemExit(1)
PY
}

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a && . "$ENV_FILE" && set +a
fi

if [[ -n "${MOLT_ENCRYPTION_STORAGE_KEK:-}" ]]; then
  echo "Refusing plaintext MOLT_ENCRYPTION_STORAGE_KEK in production; use storageKekCommand provider." >&2
  exit 1
fi

KEK_COMMAND="${MOLTBOT_STORAGE_KEK_COMMAND:-}"
if [[ -z "$KEK_COMMAND" && -f "$CONFIG_FILE" ]]; then
  KEK_COMMAND="$(python3 - "$CONFIG_FILE" <<'PY'
import json,sys
path=sys.argv[1]
try:
    data=json.load(open(path))
    cmd=data.get("security",{}).get("encryption",{}).get("storageKekCommand")
    if isinstance(cmd,list) and cmd and isinstance(cmd[0],str):
        print(cmd[0].strip())
except Exception:
    pass
PY
)"
fi
if [[ -z "$KEK_COMMAND" ]]; then
  KEK_COMMAND="$DEFAULT_KEK_COMMAND"
fi
if [[ "$KEK_COMMAND" != /* ]]; then
  KEK_COMMAND="$INSTALL_DIR/${KEK_COMMAND#./}"
fi

if [[ ! -x "$KEK_COMMAND" ]]; then
  echo "Missing KEK provider command: $KEK_COMMAND" >&2
  exit 1
fi

if ! KEK_OUT="$("$KEK_COMMAND")" || ! is_valid_kek "$KEK_OUT"; then
  echo "KEK provider failed to return a valid base64 32-byte key." >&2
  exit 1
fi
unset KEK_OUT

if [[ ! -x "$ATTESTATION_VERIFY" ]]; then
  echo "Missing verifier script: $ATTESTATION_VERIFY" >&2
  exit 1
fi

if [[ ! -f "$ATTESTATION_FILE" ]]; then
  if [[ ! -x "$ATTESTATION_GENERATOR" ]]; then
    echo "Missing attestation generator: $ATTESTATION_GENERATOR" >&2
    exit 1
  fi
  if [[ ! -e /dev/attestation/quote ]]; then
    echo "Missing /dev/attestation/quote; SGX attestation device not available." >&2
    exit 1
  fi
  "$ATTESTATION_GENERATOR" "$ATTESTATION_FILE"
  chmod 0644 "$ATTESTATION_FILE"
fi
