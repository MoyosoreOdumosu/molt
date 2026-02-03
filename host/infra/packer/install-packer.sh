#!/usr/bin/env bash
# Download Packer into .bin/ for local use (no system install).
# Run from infra/packer/: ./install-packer.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

VERSION="${PACKER_VERSION:-1.11.2}"
ARCH="$(uname -m)"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"

case "$OS" in
  darwin)
    case "$ARCH" in
      x86_64)  PLATFORM="darwin_amd64" ;;
      arm64)   PLATFORM="darwin_arm64" ;;
      *) echo "Unsupported arch: $ARCH"; exit 1 ;;
    esac ;;
  linux)
    case "$ARCH" in
      x86_64)  PLATFORM="linux_amd64" ;;
      aarch64|arm64) PLATFORM="linux_arm64" ;;
      *) echo "Unsupported arch: $ARCH"; exit 1 ;;
    esac ;;
  *) echo "Unsupported OS: $OS"; exit 1 ;;
esac

ZIP="packer_${VERSION}_${PLATFORM}.zip"
URL="https://releases.hashicorp.com/packer/${VERSION}/${ZIP}"
BIN_DIR=".bin"
mkdir -p "$BIN_DIR"

echo "Downloading Packer ${VERSION} (${PLATFORM})..."
curl -sL -o "$BIN_DIR/packer.zip" "$URL"
unzip -o -q "$BIN_DIR/packer.zip" -d "$BIN_DIR"
rm -f "$BIN_DIR/packer.zip"
chmod +x "$BIN_DIR/packer"

"$BIN_DIR/packer" version
echo "Packer installed at $SCRIPT_DIR/$BIN_DIR/packer"
