// SQLite(구 홈서버 app.db) → Aurora DSQL 데이터 이전 + 업로드 파일 → S3.
//
// 사용:
//   SRC_DB=.migration-src/app.db SRC_UPLOADS=.migration-src/uploads npm run db:import -- [--wipe] [--dry-run] [--skip-files]
//   (DSQL_ENDPOINT, FILES_BUCKET, AWS 자격증명은 .env / 환경변수)
//
// 원칙
//  - 정수 id → 새 UUID. 표마다 old→new 매핑을 만들어 FK 를 전부 다시 잇는다. 순서는 부모 → 자식.
//  - 대상 DB 에 이미 행이 있으면 중단한다 (--wipe 를 주면 전부 지우고 다시 넣는다). 실수로 두 번 넣는 사고 방지.
//  - 끝나면 표별 행 수, 거래 금액 합계(공급가액·부가세, 연차별), 첨부 수·바이트 합계를 원본과 대조해 하나라도 다르면 실패로 끝낸다.
//  - 파일 키는 그대로 쓴다: 첨부 "UUID.ext" → "attachments/UUID.ext", 생성 PDF "generated/{oldTxId}/x.pdf" → "generated/{newTxId}/x.pdf".
//  - DSQL 트랜잭션 한도(3,000행·10MiB) 안에서 표 단위 createMany 를 200행씩 끊는다.
import "dotenv/config";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { createPrisma } from "../src/lib/db";
import { putObject, headObject } from "../src/lib/storage";

type Row = Record<string, unknown>;
const args = new Set(process.argv.slice(2));
const WIPE = args.has("--wipe");
const DRY = args.has("--dry-run");
const SKIP_FILES = args.has("--skip-files");
const SRC_DB = process.env.SRC_DB ?? ".migration-src/app.db";
const SRC_UPLOADS = process.env.SRC_UPLOADS ?? ".migration-src/uploads";
const BATCH = 200;

const sqlite = new Database(SRC_DB, { readonly: true, fileMustExist: true });
const prisma = createPrisma();

const all = (table: string): Row[] => sqlite.prepare(`SELECT * FROM "${table}" ORDER BY id`).all() as Row[];
/** SQLite DateTime — Prisma 는 ISO 문자열로 저장하지만 레거시 행은 epoch ms 일 수 있어 둘 다 받는다. 깨진 값은 즉시 실패 */
const ms = (v: unknown): Date | null => {
  if (v === null || v === undefined || v === "") return null;
  const d = typeof v === "number" || /^\d+$/.test(String(v)) ? new Date(Number(v)) : new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new Error(`날짜 값을 해석할 수 없음: ${String(v)}`);
  return d;
};
const bool = (v: unknown) => Number(v) === 1;
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

/** 표별 old id → new uuid */
const maps: Record<string, Map<number, string>> = {};
function remap(table: string, rows: Row[]): Map<number, string> {
  const m = new Map<number, string>();
  for (const r of rows) m.set(Number(r.id), crypto.randomUUID());
  maps[table] = m;
  return m;
}
function fk(table: string, old: unknown): string | null {
  if (old === null || old === undefined) return null;
  const v = maps[table].get(Number(old));
  if (!v) throw new Error(`${table} id ${old} 매핑 없음 (고아 FK)`);
  return v;
}

async function chunks<T>(rows: T[], fn: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += BATCH) await fn(rows.slice(i, i + BATCH));
}

async function assertEmptyOrWipe() {
  const counts = await Promise.all([
    prisma.transaction.count(), prisma.project.count(), prisma.researcher.count(), prisma.attachment.count(),
    prisma.rcmsRecord.count(), prisma.rcmsImport.count(), prisma.generatedDocument.count(),
  ]);
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return;
  if (!WIPE) throw new Error(`대상 DB 에 이미 데이터가 있습니다 (${total}행). 덮어쓰려면 --wipe 를 주세요.`);
  console.log(`--wipe: 대상 DB 의 업무 데이터 ${total}행 삭제`);
  if (DRY) return;
  // 자식 → 부모 순. 기준정보(비목 트리·증빙요건)는 seed 가 관리하므로 거래 참조만 끊기면 된다
  await prisma.rcmsRecord.deleteMany();
  await prisma.rcmsImport.deleteMany();
  await prisma.generatedDocument.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.transactionItem.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.projectYear.deleteMany();
  await prisma.project.deleteMany();
  await prisma.researcher.deleteMany();
}

/** 비목 트리는 이름으로 맞춘다 — 대상에 seed 가 이미 넣어 둔 표준 항목이 있으면 그 id 를 쓰고, 없으면 만든다 */
async function importBudgetTree() {
  const items = all("BudgetItem"); const subs = all("BudgetSubItem"); const details = all("BudgetDetailItem");
  const itemMap = new Map<number, string>(); const subMap = new Map<number, string>(); const detailMap = new Map<number, string>();
  for (const it of items) {
    const name = String(it.name);
    const hit = await prisma.budgetItem.findUnique({ where: { name } });
    const id = hit?.id ?? (DRY ? crypto.randomUUID() : (await prisma.budgetItem.create({ data: { name, sortOrder: Number(it.sortOrder) } })).id);
    itemMap.set(Number(it.id), id);
  }
  for (const s of subs) {
    const budgetItemId = itemMap.get(Number(s.budgetItemId))!; const name = String(s.name);
    const hit = await prisma.budgetSubItem.findUnique({ where: { budgetItemId_name: { budgetItemId, name } } });
    const id = hit?.id ?? (DRY ? crypto.randomUUID() : (await prisma.budgetSubItem.create({ data: { budgetItemId, name } })).id);
    subMap.set(Number(s.id), id);
  }
  for (const d of details) {
    const budgetSubItemId = subMap.get(Number(d.budgetSubItemId))!; const name = String(d.name);
    const hit = await prisma.budgetDetailItem.findUnique({ where: { budgetSubItemId_name: { budgetSubItemId, name } } });
    const id = hit?.id ?? (DRY ? crypto.randomUUID() : (await prisma.budgetDetailItem.create({ data: { budgetSubItemId, name } })).id);
    detailMap.set(Number(d.id), id);
  }
  maps.BudgetItem = itemMap; maps.BudgetSubItem = subMap; maps.BudgetDetailItem = detailMap;
  // 증빙 요건은 seed 가 표준으로 다시 넣으므로 복사하지 않는다 (원본에 있는 커스텀 요건이 있으면 아래 경고)
  const evReq = all("EvidenceRequirement").length;
  console.log(`비목 ${items.length} · 세목 ${subs.length} · 세세목 ${details.length} 매핑 (증빙요건 ${evReq}건은 seed 로 재생성)`);
}

async function importResearchers() {
  const rows = all("Researcher"); const m = remap("Researcher", rows);
  const data = rows.map((r) => ({
    id: m.get(Number(r.id))!, employeeNo: str(r.employeeNo), name: String(r.name), ssn: str(r.ssn), sciTechNo: str(r.sciTechNo),
    title: str(r.title), affiliation: str(r.affiliation), workPhone: str(r.workPhone), phone: str(r.phone), email: str(r.email),
    bankName: str(r.bankName), accountNo: str(r.accountNo), homeAddress: str(r.homeAddress), workAddress: str(r.workAddress),
    researcherRegNo: str(r.researcherRegNo), createdAt: ms(r.createdAt)!, updatedAt: ms(r.updatedAt)!,
  }));
  if (!DRY) await chunks(data, (b) => prisma.researcher.createMany({ data: b }));
  console.log(`연구원 ${rows.length}`);
}

async function importProjects() {
  const rows = all("Project"); const m = remap("Project", rows);
  const data = rows.map((r) => ({
    id: m.get(Number(r.id))!, code: str(r.code), name: String(r.name), businessName: str(r.businessName), piName: str(r.piName),
    piId: fk("Researcher", r.piId), managerName: str(r.managerName), hostOrg: str(r.hostOrg), fundingAgency: str(r.fundingAgency),
    indirectRate: Number(r.indirectRate ?? 0), status: str(r.status), region: str(r.region), cardType: str(r.cardType),
    classification: str(r.classification), category: str(r.category), researchType: str(r.researchType), managementGroup: str(r.managementGroup),
    startDate: ms(r.startDate), endDate: ms(r.endDate), active: bool(r.active), createdAt: ms(r.createdAt)!, updatedAt: ms(r.updatedAt)!,
  }));
  if (!DRY) await chunks(data, (b) => prisma.project.createMany({ data: b }));
  const years = all("ProjectYear"); const ym = remap("ProjectYear", years);
  const ydata = years.map((r) => ({
    id: ym.get(Number(r.id))!, projectId: fk("Project", r.projectId)!, yearNo: Number(r.yearNo), label: str(r.label),
    fiscalYear: r.fiscalYear === null ? null : Number(r.fiscalYear), budgetCash: Number(r.budgetCash ?? 0),
    startDate: ms(r.startDate), endDate: ms(r.endDate), ledgerType: String(r.ledgerType ?? "PROJECT"),
    createdAt: ms(r.createdAt)!, updatedAt: ms(r.updatedAt)!,
  }));
  if (!DRY) await chunks(ydata, (b) => prisma.projectYear.createMany({ data: b }));
  console.log(`과제 ${rows.length} · 연차 ${years.length}`);
}

async function importTransactions() {
  const rows = all("Transaction"); const m = remap("Transaction", rows);
  const data = rows.map((r) => ({
    id: m.get(Number(r.id))!, projectYearId: fk("ProjectYear", r.projectYearId)!, date: ms(r.date)!, status: String(r.status),
    direction: String(r.direction), amount: Number(r.amount), description: str(r.description), vatRate: Number(r.vatRate ?? 10),
    vatAmount: Number(r.vatAmount ?? 0), vendor: str(r.vendor), vendorBank: str(r.vendorBank), vendorAccount: str(r.vendorAccount),
    vendorHolder: str(r.vendorHolder), purpose: str(r.purpose), paymentMethod: str(r.paymentMethod), deliveryDate: ms(r.deliveryDate),
    inspectionDate: ms(r.inspectionDate), installLocation: str(r.installLocation), paymentDueDate: ms(r.paymentDueDate),
    budgetItemId: fk("BudgetItem", r.budgetItemId), budgetSubItemId: fk("BudgetSubItem", r.budgetSubItemId),
    budgetDetailItemId: fk("BudgetDetailItem", r.budgetDetailItemId), plannedAmount: r.plannedAmount === null ? null : Number(r.plannedAmount),
    seqNo: r.seqNo === null ? null : Number(r.seqNo), createdAt: ms(r.createdAt)!, updatedAt: ms(r.updatedAt)!,
  }));
  if (!DRY) await chunks(data, (b) => prisma.transaction.createMany({ data: b }));

  const items = all("TransactionItem"); remap("TransactionItem", items);
  const idata = items.map((r) => ({
    id: maps.TransactionItem.get(Number(r.id))!, transactionId: fk("Transaction", r.transactionId)!, name: String(r.name), spec: str(r.spec),
    quantity: Number(r.quantity ?? 1), unitPrice: String(r.unitPrice ?? "0"), amount: Number(r.amount ?? 0), sortOrder: Number(r.sortOrder ?? 0),
  }));
  if (!DRY) await chunks(idata, (b) => prisma.transactionItem.createMany({ data: b }));

  const atts = all("Attachment"); remap("Attachment", atts);
  const adata = atts.map((r) => ({
    id: maps.Attachment.get(Number(r.id))!, transactionId: fk("Transaction", r.transactionId)!, fileName: String(r.fileName),
    originalName: str(r.originalName), storedName: `attachments/${String(r.storedName)}`, mimeType: str(r.mimeType), size: Number(r.size ?? 0),
    evidenceCode: str(r.evidenceCode), uploadedAt: ms(r.uploadedAt)!,
  }));
  if (!DRY) await chunks(adata, (b) => prisma.attachment.createMany({ data: b }));

  const docs = all("GeneratedDocument"); remap("GeneratedDocument", docs);
  const ddata = docs.map((r) => {
    const txId = fk("Transaction", r.transactionId);
    const oldPath = str(r.filePath);
    // generated/{oldTxId}/file.pdf → generated/{newTxId}/file.pdf
    const filePath = oldPath && txId ? oldPath.replace(/^generated\/\d+\//, `generated/${txId}/`) : oldPath;
    return {
      id: maps.GeneratedDocument.get(Number(r.id))!, transactionId: txId, projectYearId: fk("ProjectYear", r.projectYearId),
      templateCode: String(r.templateCode), format: String(r.format), content: str(r.content), filePath, createdAt: ms(r.createdAt)!,
    };
  });
  if (!DRY) await chunks(ddata, (b) => prisma.generatedDocument.createMany({ data: b }));
  console.log(`거래 ${rows.length} · 품목 ${items.length} · 첨부 ${atts.length} · 서류 ${docs.length}`);
  return { atts, docs, ddata };
}

async function importRcms() {
  const recs = all("RcmsRecord"); remap("RcmsRecord", recs);
  const data = recs.map((r) => ({
    id: maps.RcmsRecord.get(Number(r.id))!, key: String(r.key), projectYearId: fk("ProjectYear", r.projectYearId)!,
    transactionId: fk("Transaction", r.transactionId), matchMethod: str(r.matchMethod), rcmsProjectNo: String(r.rcmsProjectNo), stage: str(r.stage),
    yearNo: r.yearNo === null ? null : Number(r.yearNo), registeredAt: ms(r.registeredAt), useDate: ms(r.useDate), progress: str(r.progress),
    execStatus: str(r.execStatus), evidenceType: str(r.evidenceType), budgetPath: str(r.budgetPath), useAmount: Number(r.useAmount ?? 0),
    supplyAmount: Number(r.supplyAmount ?? 0), vatAmount: Number(r.vatAmount ?? 0), vendor: str(r.vendor), vendorBizNo: str(r.vendorBizNo),
    bank: str(r.bank), account: str(r.account), holder: str(r.holder), purpose: str(r.purpose), regType: str(r.regType), execStage: str(r.execStage),
    itemName: str(r.itemName), raw: String(r.raw ?? "{}"), firstSeenAt: ms(r.firstSeenAt)!, lastSeenAt: ms(r.lastSeenAt)!, missingSince: ms(r.missingSince),
  }));
  if (!DRY) await chunks(data, (b) => prisma.rcmsRecord.createMany({ data: b }));
  const imps = all("RcmsImport"); remap("RcmsImport", imps);
  const idata = imps.map((r) => ({
    id: maps.RcmsImport.get(Number(r.id))!, fileName: String(r.fileName), rowCount: Number(r.rowCount), newCount: Number(r.newCount),
    updatedCount: Number(r.updatedCount), missingCount: Number(r.missingCount), matchedCount: Number(r.matchedCount ?? 0),
    skipped: str(r.skipped), importedAt: ms(r.importedAt)!,
  }));
  if (!DRY) await chunks(idata, (b) => prisma.rcmsImport.createMany({ data: b }));
  console.log(`RCMS 건 ${recs.length} · 가져오기 이력 ${imps.length}`);
}

/** 파일 → S3. 원본에 없는 파일은 경고만 (DB 에는 남겨 두어 화면에서 "파일 없음"으로 드러나게) */
async function importFiles(atts: Row[], ddata: { filePath: string | null }[], docs: Row[]) {
  const plan: { src: string; key: string; contentType?: string }[] = [];
  for (const a of atts) plan.push({ src: path.join(SRC_UPLOADS, String(a.storedName)), key: `attachments/${String(a.storedName)}`, contentType: str(a.mimeType) ?? undefined });
  docs.forEach((d, i) => {
    const oldPath = str(d.filePath); const newPath = ddata[i].filePath;
    if (oldPath && newPath) plan.push({ src: path.join(SRC_UPLOADS, oldPath), key: newPath, contentType: "application/pdf" });
  });
  let ok = 0, missing = 0, bytes = 0;
  for (const p of plan) {
    if (!existsSync(p.src)) { console.warn(`  파일 없음: ${p.src}`); missing++; continue; }
    const size = statSync(p.src).size;
    if (!DRY) {
      const head = await headObject(p.key);
      if (!head || head.size !== size) await putObject(p.key, await readFile(p.src), p.contentType);
    }
    ok++; bytes += size;
  }
  console.log(`파일 ${ok}개 (${(bytes / 1024 / 1024).toFixed(1)} MB) S3 로, 원본 없음 ${missing}개`);
  return { ok, missing, bytes, planned: plan.length };
}

async function verify(files: { ok: number; missing: number; bytes: number; planned: number } | null) {
  const src = {
    tx: all("Transaction").length, item: all("TransactionItem").length, att: all("Attachment").length, doc: all("GeneratedDocument").length,
    proj: all("Project").length, year: all("ProjectYear").length, res: all("Researcher").length, rcms: all("RcmsRecord").length, imp: all("RcmsImport").length,
  };
  const dst = {
    tx: await prisma.transaction.count(), item: await prisma.transactionItem.count(), att: await prisma.attachment.count(),
    doc: await prisma.generatedDocument.count(), proj: await prisma.project.count(), year: await prisma.projectYear.count(),
    res: await prisma.researcher.count(), rcms: await prisma.rcmsRecord.count(), imp: await prisma.rcmsImport.count(),
  };
  const errors: string[] = [];
  for (const k of Object.keys(src) as (keyof typeof src)[]) if (src[k] !== dst[k]) errors.push(`${k}: 원본 ${src[k]} ≠ 대상 ${dst[k]}`);

  // 금액: 연차별 공급가액·부가세 합 (IN/OUT, 상태 무관하게 전부)
  const srcSums = sqlite.prepare(`SELECT projectYearId, direction, SUM(amount) a, SUM(vatAmount) v, COUNT(*) n FROM "Transaction" GROUP BY 1,2`).all() as Row[];
  for (const s of srcSums) {
    const newYear = maps.ProjectYear.get(Number(s.projectYearId));
    const agg = await prisma.transaction.aggregate({ where: { projectYearId: newYear, direction: String(s.direction) }, _sum: { amount: true, vatAmount: true }, _count: true });
    if ((agg._sum.amount ?? 0) !== Number(s.a) || (agg._sum.vatAmount ?? 0) !== Number(s.v) || agg._count !== Number(s.n))
      errors.push(`연차 ${s.projectYearId} ${s.direction}: 합계 불일치 (원본 ${s.a}/${s.v}/${s.n}, 대상 ${agg._sum.amount}/${agg._sum.vatAmount}/${agg._count})`);
  }
  // 첨부 크기 합
  const srcBytes = Number((sqlite.prepare(`SELECT COALESCE(SUM(size),0) b FROM Attachment`).get() as Row).b);
  const dstBytes = (await prisma.attachment.aggregate({ _sum: { size: true } }))._sum.size ?? 0;
  if (srcBytes !== dstBytes) errors.push(`첨부 바이트 합 불일치: ${srcBytes} ≠ ${dstBytes}`);
  // 거래마다 품목·첨부 수
  const perTx = sqlite.prepare(`SELECT t.id, (SELECT COUNT(*) FROM TransactionItem i WHERE i.transactionId=t.id) items, (SELECT COUNT(*) FROM Attachment a WHERE a.transactionId=t.id) atts FROM "Transaction" t`).all() as Row[];
  for (const r of perTx) {
    const id = maps.Transaction.get(Number(r.id))!;
    const [items, atts] = await Promise.all([prisma.transactionItem.count({ where: { transactionId: id } }), prisma.attachment.count({ where: { transactionId: id } })]);
    if (items !== Number(r.items) || atts !== Number(r.atts)) errors.push(`거래 ${r.id}: 품목 ${r.items}→${items}, 첨부 ${r.atts}→${atts}`);
  }
  if (files && files.missing > 0) errors.push(`원본 파일 없음 ${files.missing}개`);

  console.log("--- 검증 ---");
  console.log(`원본 ${JSON.stringify(src)}`);
  console.log(`대상 ${JSON.stringify(dst)}`);
  if (errors.length) { for (const e of errors) console.error("✗ " + e); throw new Error(`검증 실패 ${errors.length}건`); }
  console.log("✓ 행 수·금액 합계·거래별 품목/첨부 수·첨부 바이트 합 일치");
}

async function main() {
  console.log(`원본 ${SRC_DB} → DSQL ${process.env.DSQL_ENDPOINT} / S3 ${process.env.FILES_BUCKET}${DRY ? " (dry-run)" : ""}`);
  await assertEmptyOrWipe();
  await importBudgetTree();
  await importResearchers();
  await importProjects();
  const { atts, docs, ddata } = await importTransactions();
  await importRcms();
  const files = SKIP_FILES ? null : await importFiles(atts, ddata, docs);
  if (!DRY) await verify(files);
  // 구→신 id 매핑을 남겨 둔다 (공유 링크·문의 대응용)
  const idMap = Object.fromEntries(Object.entries(maps).map(([t, m]) => [t, Object.fromEntries(m)]));
  const { writeFile } = await import("node:fs/promises");
  const out = `.migration-src/id-map-${new Date().toISOString().slice(0, 10)}.json`;
  if (!DRY) await writeFile(out, JSON.stringify(idMap, null, 1));
  console.log(DRY ? "dry-run 완료 (쓰기 없음)" : `완료. id 매핑: ${out}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { sqlite.close(); await prisma.$disconnect(); });

// createReadStream 은 큰 파일 스트리밍이 필요해질 때를 위해 남겨 둔다 (현재 파일은 전부 20MB 이하라 readFile)
void createReadStream;
