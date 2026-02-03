#!/usr/bin/env bash
# Initialize Packer (if needed) and build the image.
# Uses .bin/packer if present, else system 'packer'.
# Run from infra/packer/: ./build.sh
# Build takes 30–60 min (ISO download, VM install, provisioners).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Use config.packer.json from image:prepare when present; else ../../config.json
HOST_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
if [[ -f "$HOST_DIR/config.packer.json" ]]; then
  MOLTBOT_CONFIG="$HOST_DIR/config.packer.json"
else
  MOLTBOT_CONFIG="$HOST_DIR/config.json"
fi

if [[ -x .bin/packer ]]; then
  PACKER=".bin/packer"
else
  PACKER="packer"
  if ! command -v packer &>/dev/null; then
    echo "Packer not found. Run: ./install-packer.sh"
    exit 1
  fi
fi

# Enable verbose debug logs when DEBUG=1.
if [[ "${DEBUG:-0}" == "1" ]]; then
  export PACKER_LOG=1
  export PACKER_LOG_PATH="${SCRIPT_DIR}/packer-debug.log"
  echo "Packer debug log: ${PACKER_LOG_PATH}"
fi

"$PACKER" init -upgrade .
"$PACKER" build -force \
  -var "moltbot_binary=../../releases/moltbot-host" \
  -var "moltbot_config=$MOLTBOT_CONFIG" \
  -var "release_manifest=../../releases/latest.json" \
  .

echo "Image: $SCRIPT_DIR/output/moltbot-ubuntu-22.04/"
