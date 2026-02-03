#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
cp config.b.json config.json
node src/index.js post "topic/announcements" "PUBLIC" "hello from Bot-B $(date +%s)"
