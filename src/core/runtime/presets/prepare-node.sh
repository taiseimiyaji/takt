#!/usr/bin/env bash
set -euo pipefail

runtime_root="${TAKT_RUNTIME_ROOT:?TAKT_RUNTIME_ROOT is required}"
runtime_tmp="${TAKT_RUNTIME_TMP:-$runtime_root/tmp}"
npm_cache="$runtime_root/npm"

mkdir -p "$runtime_tmp" "$npm_cache"

echo "npm_config_cache=$npm_cache"
echo "TMPDIR=$runtime_tmp"
