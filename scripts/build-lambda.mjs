// Lambda 배포 묶음 만들기 — next build(standalone) 결과를 infra/build/ 에 모은다.
// Lambda Web Adapter(레이어)가 run.sh 를 실행하고, run.sh 가 Next standalone server.js 를 띄운다.
// 결과 디렉터리: infra/build/{server.js, .next/, node_modules/, public/, run.sh, package.json}
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "infra", "build");
const standalone = path.join(root, ".next", "standalone");

execSync("node_modules/.bin/prisma generate", { stdio: "inherit" });
execSync("node_modules/.bin/next build", { stdio: "inherit", env: { ...process.env, NODE_ENV: "production" } });
if (!existsSync(standalone)) throw new Error(".next/standalone 이 없습니다. next.config.ts 의 output: 'standalone' 을 확인하세요.");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(standalone, out, { recursive: true });
// 정적 파일·public 은 standalone 에 포함되지 않으므로 직접 복사
cpSync(path.join(root, ".next", "static"), path.join(out, ".next", "static"), { recursive: true });
cpSync(path.join(root, "public"), path.join(out, "public"), { recursive: true });

writeFileSync(path.join(out, "run.sh"), "#!/bin/bash\nexec node server.js\n");
chmodSync(path.join(out, "run.sh"), 0o755);

// 불필요한 큰 파일 제거 (standalone 추적에 끌려온 캐시 등)
for (const rel of [".next/cache"]) rmSync(path.join(out, rel), { recursive: true, force: true });

const size = execSync(`du -sh "${out}"`).toString().trim();
console.log(`Lambda 번들 준비 완료: ${out} (${size})`);
