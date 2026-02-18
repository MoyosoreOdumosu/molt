#!/usr/bin/env bash
set -euo pipefail

# Provision a TPM-sealed 32-byte KEK and persist it at a handle.
# Also writes MOLTBOT_TPM2_KEK_HANDLE into env file for moltbot runtime.
#
# Requires: tpm2-tools package (tpm2_createprimary, tpm2_create, tpm2_load,
# tpm2_evictcontrol, tpm2_readpublic, tpm2_unseal)
#
# Example:
#   sudo ./provision-tpm-kek.sh --handle 0x81010020 --env-file /etc/moltbot/moltbot.env

HANDLE="${MOLTBOT_TPM2_KEK_HANDLE:-0x81010020}"
ENV_FILE="/etc/moltbot/moltbot.env"
OWNER_AUTH="${MOLTBOT_TPM2_OWNER_AUTH:-}"
OWNER_AUTH_FILE="${MOLTBOT_TPM2_OWNER_AUTH_FILE:-}"
OBJECT_AUTH="${MOLTBOT_TPM2_KEK_AUTH:-}"
OBJECT_AUTH_FILE="${MOLTBOT_TPM2_KEK_AUTH_FILE:-}"
FORCE=0

usage() {
  cat <<'EOF'
Usage:
  provision-tpm-kek.sh [options]

Options:
  --handle <hex>         Persistent TPM handle (default: 0x81010020)
  --env-file <path>      Env file to update (default: /etc/moltbot/moltbot.env)
  --owner-auth <value>   TPM owner hierarchy auth for evictcontrol
  --owner-auth-file <p>  File containing TPM owner hierarchy auth
  --object-auth <value>  Auth value for sealed KEK object (not persisted to env)
  --object-auth-file <p> File containing object auth value
  --force                Replace existing object at handle
  -h, --help             Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --handle)
      HANDLE="$2"
      shift 2
      ;;
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --owner-auth)
      OWNER_AUTH="$2"
      shift 2
      ;;
    --owner-auth-file)
      OWNER_AUTH_FILE="$2"
      shift 2
      ;;
    --object-auth)
      OBJECT_AUTH="$2"
      shift 2
      ;;
    --object-auth-file)
      OBJECT_AUTH_FILE="$2"
      shift 2
      ;;
    --force)
      FORCE=1
      shift 1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -n "$OBJECT_AUTH" && -n "$OBJECT_AUTH_FILE" ]]; then
  echo "Use either --object-auth or --object-auth-file, not both." >&2
  exit 1
fi

if [[ -n "$OWNER_AUTH" && -n "$OWNER_AUTH_FILE" ]]; then
  echo "Use either --owner-auth or --owner-auth-file, not both." >&2
  exit 1
fi

if [[ -n "$OWNER_AUTH_FILE" && ! -f "$OWNER_AUTH_FILE" ]]; then
  echo "owner auth file does not exist: $OWNER_AUTH_FILE" >&2
  exit 1
fi

if [[ -n "$OBJECT_AUTH_FILE" && ! -f "$OBJECT_AUTH_FILE" ]]; then
  echo "object auth file does not exist: $OBJECT_AUTH_FILE" >&2
  exit 1
fi

required_bins=(
  tpm2_createprimary
  tpm2_create
  tpm2_load
  tpm2_evictcontrol
  tpm2_readpublic
  tpm2_unseal
  openssl
  awk
)
for bin in "${required_bins[@]}"; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "Missing required binary: $bin" >&2
    exit 1
  fi
done

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

kek_raw="$tmp_dir/kek.bin"
kek_pub="$tmp_dir/kek.pub"
kek_priv="$tmp_dir/kek.priv"
primary_ctx="$tmp_dir/primary.ctx"
sealed_ctx="$tmp_dir/sealed.ctx"
kek_check="$tmp_dir/kek.check"

openssl rand 32 > "$kek_raw"
chmod 0600 "$kek_raw"

evict_args=(-Q -C o)
if [[ -n "$OWNER_AUTH" ]]; then
  evict_args+=(-P "$OWNER_AUTH")
elif [[ -n "$OWNER_AUTH_FILE" ]]; then
  evict_args+=(-P "file:$OWNER_AUTH_FILE")
fi

if tpm2_readpublic -Q -c "$HANDLE" >/dev/null 2>&1; then
  if [[ "$FORCE" -ne 1 ]]; then
    echo "TPM handle already exists: $HANDLE (use --force to replace)." >&2
    exit 1
  fi
  tpm2_evictcontrol "${evict_args[@]}" -c "$HANDLE" >/dev/null
fi

tpm2_createprimary -Q -C o -g sha256 -G rsa -c "$primary_ctx"

create_args=(-Q -C "$primary_ctx" -G keyedhash -u "$kek_pub" -r "$kek_priv" -i "$kek_raw")
if [[ -n "$OBJECT_AUTH_FILE" ]]; then
  create_args+=(-p "file:$OBJECT_AUTH_FILE")
elif [[ -n "$OBJECT_AUTH" ]]; then
  create_args+=(-p "$OBJECT_AUTH")
fi
tpm2_create "${create_args[@]}"

tpm2_load -Q -C "$primary_ctx" -u "$kek_pub" -r "$kek_priv" -c "$sealed_ctx"
tpm2_evictcontrol "${evict_args[@]}" -c "$sealed_ctx" "$HANDLE" >/dev/null

unseal_args=(-Q -c "$HANDLE")
if [[ -n "$OBJECT_AUTH_FILE" ]]; then
  unseal_args+=(-p "file:$OBJECT_AUTH_FILE")
elif [[ -n "$OBJECT_AUTH" ]]; then
  unseal_args+=(-p "$OBJECT_AUTH")
fi
tpm2_unseal "${unseal_args[@]}" > "$kek_check"

if ! cmp -s "$kek_raw" "$kek_check"; then
  echo "TPM unseal verification failed: recovered key mismatch." >&2
  exit 1
fi

env_dir="$(dirname "$ENV_FILE")"
mkdir -p "$env_dir"
touch "$ENV_FILE"
chmod 0640 "$ENV_FILE"
if getent group moltbot >/dev/null 2>&1; then
  chgrp moltbot "$ENV_FILE" || true
fi

backup="$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"
cp "$ENV_FILE" "$backup"

awk '
  $0 !~ /^MOLTBOT_TPM2_KEK_HANDLE=/ &&
  $0 !~ /^MOLTBOT_TPM2_KEK_AUTH=/ &&
  $0 !~ /^MOLTBOT_TPM2_KEK_AUTH_FILE=/
' "$ENV_FILE" > "$tmp_dir/env.filtered"
mv "$tmp_dir/env.filtered" "$ENV_FILE"

{
  echo "MOLTBOT_TPM2_KEK_HANDLE=$HANDLE"
  if [[ -n "$OBJECT_AUTH_FILE" ]]; then
    echo "MOLTBOT_TPM2_KEK_AUTH_FILE=$OBJECT_AUTH_FILE"
  fi
} >> "$ENV_FILE"

chmod 0640 "$ENV_FILE"
if getent group moltbot >/dev/null 2>&1; then
  chgrp moltbot "$ENV_FILE" || true
fi

echo "Provisioned TPM KEK at handle: $HANDLE"
echo "Updated env file: $ENV_FILE"
echo "Backup written: $backup"
if [[ -n "$OBJECT_AUTH" ]]; then
  echo "Note: object auth was used but not persisted to env file; set MOLTBOT_TPM2_KEK_AUTH_FILE for runtime."
fi
echo "Next: restart services (systemctl daemon-reload && systemctl restart moltbot-host)"
