#!/usr/bin/env bash
# 서버리스 배포 — Lambda 번들 → SAM 배포 → DB 마이그레이션·seed → 헬스체크.
# 사용: scripts/deploy.sh [prod|dev]   (비밀값은 infra/params.<stage>.env 에서 읽는다 — git 에 올리지 않음)
#
# infra/params.prod.env 예시:
#   SessionSecret=...            (openssl rand -base64 48)
#   GoogleClientId=...
#   GoogleClientSecret=...
#   GeminiApiKey=...
#   AuthAllowedDomains=vendit.co.kr
set -euo pipefail
cd "$(dirname "$0")/.."

STAGE="${1:-prod}"
STACK="budget-${STAGE}"
REGION="${AWS_REGION:-ap-northeast-2}"
PARAMS_FILE="infra/params.${STAGE}.env"

# 템플릿 Default 는 스택 생성 때만 적용되고 update 에선 기존 값이 유지되므로 도메인은 항상 명시한다
DOMAIN="${DOMAIN:-subjects.agopher.org}"
overrides=("Stage=${STAGE}" "DomainName=${DOMAIN}")
if [[ -f "$PARAMS_FILE" ]]; then
  while IFS='=' read -r k v; do
    [[ -z "$k" || "$k" == \#* ]] && continue
    overrides+=("${k}=${v}")
  done < "$PARAMS_FILE"
else
  echo "⚠ $PARAMS_FILE 없음 — SessionSecret 등 비밀값 없이 배포됩니다 (로그인 게이트 꺼짐)" >&2
fi

VERSION=$(node -p "require('./package.json').version")
if ! grep -q "^## \[${VERSION}\]" CHANGELOG.md; then
  echo "✗ CHANGELOG.md 에 [${VERSION}] 항목이 없습니다. 변경 내용을 적고 package.json version 과 맞춘 뒤 다시 배포하세요." >&2
  exit 1
fi
echo "== 버전 v${VERSION}"

echo "== 1/4 Lambda 번들"
npm run build:lambda

echo "== 2/4 CloudFormation 배포 ($STACK, $REGION)"
# SAM CLI 없이 aws cli 로: package(코드 zip → 아티팩트 버킷) → deploy(Serverless 변환 포함)
ARTIFACT_BUCKET="${ARTIFACT_BUCKET:-aws-sam-cli-managed-default-samclisourcebucket-n1d0axgoz772}"
aws cloudformation package \
  --template-file infra/template.yaml \
  --s3-bucket "$ARTIFACT_BUCKET" \
  --s3-prefix "budget-${STAGE}" \
  --region "$REGION" \
  --output-template-file infra/packaged.yaml >/dev/null
aws cloudformation deploy \
  --template-file infra/packaged.yaml \
  --stack-name "$STACK" \
  --region "$REGION" \
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
  --no-fail-on-empty-changeset \
  --tags Project=budget Stage="$STAGE" \
  --parameter-overrides "${overrides[@]}"

ENDPOINT=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='DsqlEndpoint'].OutputValue" --output text)
BUCKET=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='FilesBucketName'].OutputValue" --output text)
URL=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='Url'].OutputValue" --output text)

echo "== 3/4 DB 마이그레이션 + seed ($ENDPOINT)"
DSQL_ENDPOINT="$ENDPOINT" FILES_BUCKET="$BUCKET" AWS_REGION="$REGION" npm run db:migrate
DSQL_ENDPOINT="$ENDPOINT" FILES_BUCKET="$BUCKET" AWS_REGION="$REGION" npm run db:seed

echo "== 4/4 헬스체크"
for i in $(seq 1 10); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$URL/api/health" || true)
  if [[ "$code" == "200" ]]; then
    echo "OK $URL (v${VERSION})"
    # prod 배포 성공 시 버전 태그 (이미 있으면 건너뜀)
    if [[ "$STAGE" == "prod" ]] && ! git rev-parse -q --verify "refs/tags/v${VERSION}" >/dev/null; then
      git tag -a "v${VERSION}" -m "v${VERSION} 배포 $(date +%Y-%m-%d)" && echo "태그 v${VERSION} 생성 (git push origin v${VERSION} 로 올리세요)"
    fi
    exit 0
  fi
  sleep 3
done
echo "✗ 헬스체크 실패 ($URL/api/health → $code)" >&2
exit 1
