#!/usr/bin/env bash
# 최신 이미지 pull → docker compose 기동 → Cloudflare Quick Tunnel 실행 → 접속 URL 출력.
# docker-compose.yml 과 같은 디렉토리에 두고 실행한다.  사용: ./serve.sh
set -uo pipefail

cd "$(dirname "$0")"

command -v docker >/dev/null      || { echo "✗ docker 가 없습니다."; exit 1; }
command -v cloudflared >/dev/null || { echo "✗ cloudflared 가 없습니다."; exit 1; }
[ -f docker-compose.yml ]         || { echo "✗ 현재 위치에 docker-compose.yml 이 없습니다."; exit 1; }

PORT="${PORT:-3000}"

echo "▶ 최신 이미지 pull..."
docker compose pull

echo "▶ 컨테이너 기동..."
docker compose up -d

echo "▶ 앱 헬스 체크 (localhost:${PORT})..."
for _ in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${PORT}/" || true)
  [ "$code" = "200" ] && { echo "  ✓ 앱 준비됨 (200)"; break; }
  sleep 2
done

LOG="$(mktemp)"
echo "▶ Cloudflare Tunnel 시작..."
cloudflared tunnel --url "http://localhost:${PORT}" >"$LOG" 2>&1 &
CF_PID=$!

cleanup() { echo; echo "터널 종료 (컨테이너는 계속 실행 중)"; kill "$CF_PID" 2>/dev/null; rm -f "$LOG"; }
trap cleanup INT TERM EXIT

URL=""
for _ in $(seq 1 30); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)
  [ -n "$URL" ] && break
  kill -0 "$CF_PID" 2>/dev/null || { echo "✗ cloudflared 가 종료됨:"; cat "$LOG"; exit 1; }
  sleep 1
done

[ -n "$URL" ] || { echo "✗ 접속 URL 추출 실패:"; cat "$LOG"; exit 1; }

echo
echo "=================================================="
echo "  접속 주소:  $URL"
echo "=================================================="
echo "  (Ctrl+C 로 터널만 종료 — 컨테이너/데이터는 유지됩니다)"
echo

wait "$CF_PID"
