import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

const appHost = (() => {
  try {
    return process.env.APP_URL ? new URL(process.env.APP_URL).host : null;
  } catch {
    return null;
  }
})();

// 사이드바에 표시할 앱 버전 — package.json 의 version (배포 때 CHANGELOG.md 와 맞춘다)
const appVersion = (JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string }).version;

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: appVersion },
  // Lambda(Web Adapter) 배포용 — .next/standalone 에 server.js + 필요한 node_modules 만 모은다
  output: "standalone",
  // PDF 폰트는 process.cwd()/public/fonts 에서 읽는다 (scripts/build-lambda.mjs 가 public 을 standalone 에 복사)
  outputFileTracingIncludes: { "/**": ["./public/fonts/**"] },
  experimental: {
    serverActions: {
      // 증빙 파일은 브라우저→S3 로 직접 올리므로 서버 액션 본문은 폼 데이터 + RCMS 엑셀(≤5MB) 정도. Lambda 요청 한도(6MB) 안.
      bodySizeLimit: "6mb",
      // API Gateway 커스텀 도메인 뒤에서 Origin/Host 검사가 어긋나지 않도록 공개 호스트를 허용 목록에
      ...(appHost ? { allowedOrigins: [appHost] } : {}),
    },
  },
};

export default nextConfig;
