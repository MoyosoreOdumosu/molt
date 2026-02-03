#!/usr/bin/env bash
# Open TigerVNC to the Packer VM. Use the port from the current build log, or
# detect the port from a running QEMU process. Run from infra/packer/.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Prefer port from build log (most recent vnc:// line)
if [[ -f packer-build.log ]]; then
  PORT=$(grep -o 'vnc://127.0.0.1:[0-9]*' packer-build.log 2>/dev/null | tail -1 | grep -o '[0-9]*$')
fi

# Fallback: find port from QEMU listening on 59xx
if [[ -z "${PORT:-}" ]]; then
  PORT=$(lsof -i -P -n 2>/dev/null | awk '/qemu.*59[0-9][0-9].*LISTEN/{print $9}' | head -1 | cut -d: -f2)
fi

if [[ -z "${PORT:-}" ]]; then
  echo "No VNC port found. Run ./build.sh first and wait for the vnc:// line in the log."
  echo "Or pass the port: $0 5993"
  exit 1
fi

# TigerVNC: use host::port (double colon) so it's TCP, not a display number
TIGER="/Applications/TigerVNC.app/Contents/MacOS/vncviewer"
if [[ ! -x "$TIGER" ]]; then
  echo "TigerVNC not found at $TIGER. Install: brew install --cask tigervnc-viewer"
  exit 1
fi

echo "Connecting to 127.0.0.1::$PORT (no password)"
exec "$TIGER" "127.0.0.1::$PORT"
