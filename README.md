# 과제관리 시스템 (Subject Budget Manager)

연구실의 레거시 MS Access 과제관리 DB를 웹으로 재구축한 **연구과제 예산집행 관리 시스템**입니다.

레거시는 "과제 × 연차"마다 동일 구조의 장부 테이블을 복제하던 구조였는데, 이를 **단일 거래 원장(Transaction ledger)** 으로 정규화했습니다.

## 주요 기능

- **대시보드** — 과제별 집행률·비목별 집행 분포·최근 거래 요약
- **과제 / 연차 관리** — 과제 마스터 + 연차별 예산 편성
- **집행 원장** — 비목→세목→세세목 3단계 분류로 거래 입력, 비목별 잔액 실시간 집계 (잔액 = Σ입금 − Σ출금)
- **증빙 첨부** — 거래별 영수증·증빙 파일 업로드 / 미리보기
- **연구원 관리** — 명단 CRUD (민감정보 마스킹)
- **기준정보** — 정부 R&D 표준 비목/세목/세세목 분류 체계

## 기술 스택

- [Next.js 16](https://nextjs.org) (App Router) · React 19 · TypeScript
- [Prisma 7](https://www.prisma.io) + [Amazon Aurora DSQL](https://aws.amazon.com/rds/aurora/dsql/) (PostgreSQL 호환 서버리스, IAM 토큰 인증)
- 파일 저장소: Amazon S3 (브라우저 → S3 직접 업로드, presigned URL 다운로드)
- 실행: AWS Lambda (Web Adapter) + HTTP API Gateway, `subjects.agopher.org`
- Tailwind CSS v4
- 서버 액션 기반 폼 처리 / 서버 렌더 차트(의존성 없음)

## 데이터 모델

```
Project (과제)
  └─ ProjectYear (연차) — 편성예산
       └─ Transaction (집행내역) — 입금/출금, 비목 FK
            └─ Attachment (증빙)

BudgetItem(비목) → BudgetSubItem(세목) → BudgetDetailItem(세세목)
Researcher (연구원)
```

## 시작하기 (로컬 개발)

로컬에도 DB 서버가 없습니다. 개발용 DSQL 클러스터·S3 버킷에 AWS 자격증명(`~/.aws` default 프로필)으로 붙습니다.

```bash
npm install
cp .env.example .env         # DSQL_ENDPOINT / FILES_BUCKET / AWS_REGION
npx prisma generate
npm run db:migrate           # DSQL 에 마이그레이션 적용 (IAM 토큰 자동 발급)
npm run db:seed              # 비목/세목/세세목 기준정보 + 증빙 요건
npm run dev                  # http://localhost:3000
```

## 배포 (AWS 서버리스)

`infra/template.yaml`(SAM 문법) 하나로 DSQL 클러스터·S3 버킷·ACM 인증서·Lambda·HTTP API·Route 53 레코드·예산 알림을 만듭니다.
bizcard/vcmc 스택과 같은 구성입니다.

```bash
# 비밀값은 infra/params.prod.env (git 제외): SessionSecret, GoogleClientId, GoogleClientSecret, GeminiApiKey
npm run deploy               # = scripts/deploy.sh prod
```

배포 스크립트 순서: `next build`(standalone) → `infra/build/` 번들 → `aws cloudformation package/deploy` → `prisma migrate deploy` + seed → 헬스체크.

| 환경변수 (Lambda) | 설명 |
|---|---|
| `DSQL_ENDPOINT` | DSQL 클러스터 엔드포인트. 비밀번호 없음(IAM `dsql:DbConnectAdmin`) |
| `FILES_BUCKET` | 증빙·생성 PDF 버킷. `staging/` 은 1일 뒤 자동 삭제 |
| `APP_URL` | 공개 주소. 구글 로그인 리디렉션 URI 계산 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `SESSION_SECRET` | 셋 다 있어야 로그인 게이트가 켜짐 |
| `AUTH_ALLOWED_DOMAINS` | 허용 이메일 도메인 (기본 `vendit.co.kr`) |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | 증빙 자동입력 |

### DSQL 때문에 다른 점

- id 는 모두 UUID (시퀀스 대신). URL 도 `/projects/<uuid>/...`
- 마이그레이션 SQL 은 `aurora-dsql-prisma migrate` 로 생성 (인덱스 `ASYNC`, FK `NOT VALID`, DDL 하나당 트랜잭션 하나). 스키마를 바꾸면:
  ```bash
  npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script | npx aurora-dsql-prisma transform > prisma/migrations/<시각>_<이름>/migration.sql
  ```
- 트랜잭션당 3,000행·10MiB 한도. cascade 삭제도 포함되므로 대량 삭제는 나눠서.
- Lambda 요청·응답 6MB 한도 → 파일은 브라우저가 S3 에 직접 올리고(presigned PUT), 다운로드는 presigned GET 리다이렉트.

### 구 홈서버(SQLite) 에서 데이터 가져오기

```bash
SRC_DB=.migration-src/app.db SRC_UPLOADS=.migration-src/uploads npm run db:import -- --dry-run
npm run db:import -- --wipe     # 정수 id → UUID 재매핑, 파일 → S3, 끝나면 행 수·금액 합계·첨부 바이트 대조
```

## 라이선스

내부용 프로젝트입니다.
