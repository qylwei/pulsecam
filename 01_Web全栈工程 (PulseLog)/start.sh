#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo 'Please install Node.js 20+.' >&2; exit 1; }
test -d node_modules/express || { echo 'Run npm ci first.' >&2; exit 1; }
PORT="${PORT:-3100}" node src/server.js
