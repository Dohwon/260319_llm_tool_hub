#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

HOST=127.0.0.1 \
PORT=4299 \
PROMPT_DEV_MOCK=1 \
PROMPT_CHECKOUT_URL="http://127.0.0.1:4299/#prompt-tailor" \
python3 server.py
