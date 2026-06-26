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
- [Prisma 7](https://www.prisma.io) + SQLite (better-sqlite3 어댑터)
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

## 시작하기

```bash
npm install
npx prisma migrate dev      # DB 생성 + 마이그레이션
npx prisma db seed          # 비목/세목/세세목 기준정보 적재
npm run dev                 # http://localhost:3000
```

## 배포 (개인 서버 self-host)

이 앱은 Next.js 모놀리식(서버 액션 + Prisma + SQLite + 로컬 파일 업로드)이라 단일 Docker 컨테이너로 self-host 합니다. SQLite DB와 증빙 파일은 볼륨에 영속 저장됩니다.

```bash
# 로컬 빌드 후 실행
docker compose up --build -d
# http://localhost:3000  (data/, uploads/ 디렉토리에 영속)
```

GitHub Actions가 `main` 푸시마다 이미지를 [GHCR](https://ghcr.io)에 푸시하므로, 서버에서는 빌드 없이 pull만 하면 됩니다:

```bash
docker pull ghcr.io/orcogre-vendit/subject-budget-manager:latest
# docker-compose.yml에서 build: . 대신 image: 줄을 사용
```

컨테이너 시작 시 마이그레이션(`prisma migrate deploy`)과 기준정보 seed가 자동 적용됩니다.

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `DATABASE_URL` | `file:/app/data/app.db` | SQLite 경로(볼륨) |
| `UPLOAD_DIR` | `/app/uploads` | 증빙 저장 경로(볼륨) |
| `PORT` | `3000` | 포트 |

> Vercel은 서버리스 파일시스템이 임시·읽기전용이라 로컬 SQLite·파일 업로드와 맞지 않습니다. 이 앱은 영속 디스크가 있는 서버(개인 서버/Fly.io/Railway 등)에 self-host 하는 구성입니다.

## 라이선스

내부용 프로젝트입니다.
