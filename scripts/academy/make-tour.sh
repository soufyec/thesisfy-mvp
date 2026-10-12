#!/usr/bin/env bash
# Records and composes the onboarding tour video for each UI language.
#
#   TOUR_OUT=/tmp/tour-video scripts/academy/make-tour.sh en es fr
#
# Needs: a production build (`npm run build`), Playwright + Chromium (PW_CHROMIUM), ffmpeg, and the narration clips in
# $TOUR_OUT/nar (python scripts/academy/tts-tour.py). Each take restarts the server so the demo thesis is fresh: the
# AI share of thesis_1 rises with every insertion.
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT="${TOUR_OUT:-/tmp/tour-video}"
PORT="${TOUR_PORT:-3050}"
DEST="${TOUR_DEST:-public/videos}"
stop() { for p in $(ps aux | grep -E "[n]ext(-server| start)" | awk '{print $2}'); do kill "$p" 2>/dev/null || true; done; sleep 1; }
for lang in "$@"; do
  stop
  JWT_SECRET=tour npx next start -p "$PORT" > "$OUT/server-$lang.log" 2>&1 &
  for _ in $(seq 1 60); do curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/" | grep -q 200 && break; sleep 1; done
  TOUR_LANG="$lang" TOUR_OUT="$OUT" TOUR_BASE="http://localhost:$PORT" node scripts/academy/record-tour.mjs
  python3 scripts/academy/compose-tour.py "$lang" --out "$OUT" --dest "$DEST"
done
stop
