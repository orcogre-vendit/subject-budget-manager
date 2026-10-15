// Lambda Web Adapter readiness 체크 — DB 를 건드리지 않는다
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}
