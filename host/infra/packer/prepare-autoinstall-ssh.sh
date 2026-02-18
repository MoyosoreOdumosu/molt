#!/usr/bin/env bash
set -euo pipefail

# Keep Packer communicator SSH key and cloud-init authorized keys in sync.
# Also ensures local key file permissions are strict.
#
# Usage:
#   ./prepare-autoinstall-ssh.sh [pubkey_file] [user_data_file]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBKEY_FILE="${1:-$SCRIPT_DIR/packer_ssh_ed25519.pub}"
USER_DATA_FILE="${2:-$SCRIPT_DIR/cloud-init/user-data}"
PRIVKEY_FILE="${SCRIPT_DIR}/packer_ssh_ed25519"

if [[ ! -f "$PUBKEY_FILE" ]]; then
  echo "Missing SSH public key: $PUBKEY_FILE" >&2
  exit 1
fi

if [[ ! -f "$USER_DATA_FILE" ]]; then
  echo "Missing cloud-init user-data file: $USER_DATA_FILE" >&2
  exit 1
fi

PUBKEY="$(tr -d '\r\n' < "$PUBKEY_FILE")"
if [[ -z "$PUBKEY" ]]; then
  echo "SSH public key is empty: $PUBKEY_FILE" >&2
  exit 1
fi

python3 - "$USER_DATA_FILE" "$PUBKEY" <<'PY'
import pathlib
import re
import sys

user_data = pathlib.Path(sys.argv[1])
pubkey = sys.argv[2]
text = user_data.read_text(encoding="utf-8")
lines = text.splitlines()

auth_idx = None
auth_indent = ""
for i, line in enumerate(lines):
    stripped = line.strip()
    if stripped in {"authorized-keys:", "ssh_authorized_keys:"}:
        auth_idx = i
        auth_indent = re.match(r"^(\s*)", line).group(1)
        break

if auth_idx is None:
    raise SystemExit("authorized keys block not found in user-data")

entry_indent = auth_indent + "  "
entry_line = f'{entry_indent}- "{pubkey}"'
replaced = False

for j in range(auth_idx + 1, len(lines)):
    stripped = lines[j].strip()
    current_indent = re.match(r"^(\s*)", lines[j]).group(1)
    if not stripped:
        continue
    if len(current_indent) <= len(auth_indent) and not stripped.startswith("-"):
        break
    if stripped.startswith("- "):
        lines[j] = entry_line
        replaced = True
        break

if not replaced:
    lines.insert(auth_idx + 1, entry_line)

user_data.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY

if [[ -f "$PRIVKEY_FILE" ]]; then
  chmod 600 "$PRIVKEY_FILE" || true
fi

echo "Synchronized SSH key in ${USER_DATA_FILE} with ${PUBKEY_FILE}"
