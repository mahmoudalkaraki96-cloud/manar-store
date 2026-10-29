#!/usr/bin/env bash
set -euo pipefail
STORE_PREVIEW_BUILD=1 npm run build
node scripts/prepare-preview.mjs
