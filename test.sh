#!/usr/bin/env bash
set -uo pipefail

# Launch the flip Electron app.
# Usage: ./test.sh [-s|-r] <directory>

app_dir="$(cd "$(dirname "$0")" && pwd)"
electron_bin="$app_dir/node_modules/.bin/electron"
if [[ ! -x $electron_bin ]]; then
  printf 'electron not installed — run: cd %s && npm install\n' "$app_dir" >&2
  exit 1
fi

exec "$electron_bin" "$app_dir" -- "$@"
