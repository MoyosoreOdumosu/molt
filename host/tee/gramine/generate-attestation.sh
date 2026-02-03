#!/usr/bin/env bash
set -euo pipefail

# Generate attestation evidence JSON inside a Gramine SGX enclave.
# This expects /dev/attestation/quote to be available (inside SGX).
#
# Usage:
#   ./generate-attestation.sh ./attestation.json

out="${1:-./attestation.json}"

if [[ ! -e /dev/attestation/quote ]]; then
  echo "/dev/attestation/quote not available. Run inside SGX/Gramine." >&2
  exit 1
fi

quote_bin="$(cat /dev/attestation/quote | base64)"
ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

cat <<JSON > "$out"
{"quote_base64":"$quote_bin","timestamp":"$ts"}
JSON

echo "Wrote attestation evidence to $out"
