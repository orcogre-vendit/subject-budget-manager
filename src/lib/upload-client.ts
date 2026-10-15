// 브라우저 → S3 직접 업로드 (presigned PUT). 서버(Lambda)를 거치지 않으므로 20MB 파일도 올라간다.
// 결과 키는 "staging/UUID.ext" — 거래 저장 시 서버가 attachments/ 로 옮긴다.

export type StagedUpload = { key: string; name: string; type: string; size: number };

/** 파일 하나를 staging 에 올린다. 실패하면 사용자에게 보여줄 메시지로 throw */
export async function uploadToStaging(file: File, signal?: AbortSignal): Promise<StagedUpload> {
  const type = file.type || "application/octet-stream";
  const res = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, type }),
    signal,
  });
  const signed = (await res.json().catch(() => ({}))) as Partial<StagedUpload> & { url?: string; error?: string };
  if (!res.ok || !signed.url || !signed.key) throw new Error(signed.error || "업로드 주소를 받지 못했습니다.");

  const put = await fetch(signed.url, { method: "PUT", headers: { "Content-Type": type }, body: file, signal });
  if (!put.ok) throw new Error(`'${file.name}' 업로드에 실패했습니다. (${put.status})`);
  return { key: signed.key, name: signed.name ?? file.name, type, size: file.size };
}
