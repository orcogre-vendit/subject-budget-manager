import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 증빙 업로드는 서버 액션(FormData)으로 올라간다. 기본 1MB 로는 PDF 한 장도 막히므로
      // 파일당 20MB × 여러 장 + 폼 데이터를 감안해 넉넉히 잡는다 (파일 개수·크기 검증은 액션 안에서 별도 수행)
      bodySizeLimit: "110mb",
    },
  },
};

export default nextConfig;
