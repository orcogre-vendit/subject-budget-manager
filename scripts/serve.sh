#!/usr/bin/env bash
# 최신 이미지 pull → docker compose 기동 → Cloudflare Quick Tunnel 실행 → 접속 URL 출력.
# docker-compose.yml 과 같은 디렉토리에 두고 실행한다.  사용: ./serve.sh
set -uo pipefail

cd "$(dirname "$0")"

command -v docker >/dev/null      || { echo "✗ docker 가 없습니다."; exit 1; }
command -v cloudflared >/dev/null || { echo "✗ cloudflared 가 없습니다."; exit 1; }
[ -f docker-compose.yml ]         || { echo "✗ 현재 위치에 docker-compose.yml 이 없습니다."; exit 1; }

# docker 접근 권한: 그룹 미적용이면 sudo 로 폴백
DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  echo "ℹ docker 그룹 미적용 — sudo 로 실행합니다 (재로그인하면 sudo 불필요)."
  DOCKER="sudo docker"
fi

PORT="${PORT:-3000}"
LOG=""
CF_PID=""
cleanup() {
  if [ -n "$CF_PID" ]; then echo; echo "터널 종료 (컨테이너/데이터는 유지)"; kill "$CF_PID" 2>/dev/null; fi
  [ -n "$LOG" ] && rm -f "$LOG"
}
trap cleanup EXIT

echo "▶ 최신 이미지 pull..."
$DOCKER compose pull

echo "▶ 컨테이너 기동..."
$DOCKER compose up -d

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

URL=""
for _ in $(seq 1 30); do
  [ -f "$LOG" ] && URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)
  [ -n "$URL" ] && break
  kill -0 "$CF_PID" 2>/dev/null || { echo "✗ cloudflared 가 종료됨:"; cat "$LOG" 2>/dev/null; exit 1; }
  sleep 1
done

[ -n "$URL" ] || { echo "✗ 접속 URL 추출 실패:"; cat "$LOG" 2>/dev/null; exit 1; }

echo
echo "=================================================="
echo "  접속 주소:  $URL"
echo "=================================================="
echo "  (Ctrl+C 로 터널만 종료 — 컨테이너/데이터는 유지됩니다)"
echo

wait "$CF_PID"
