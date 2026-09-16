// 검수(설치)완료확인서 PDF — 서버 전용(react-pdf)
// 인장·서명란 없음: 승인은 flex 전자결재로 갈음하고, 검수자 성명·검수일로 확인을 갈음한다.
// 첨부 중 evidenceCode=INSPECTION_PHOTO 인 이미지는 "붙임. 검수 사진" 페이지로 뒤에 붙는다.
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { PDF_FONT } from "./font";
import type { DocContext } from "@/lib/templates/types";

const s = StyleSheet.create({
  page: { fontFamily: PDF_FONT, fontSize: 11, paddingTop: 56, paddingHorizontal: 56, paddingBottom: 48, color: "#111" },
  title: { fontSize: 20, fontWeight: 700, textAlign: "center", letterSpacing: 6, marginBottom: 32 },
  row: { flexDirection: "row", marginBottom: 9 },
  label: { width: 96, fontWeight: 700 },
  value: { flex: 1, lineHeight: 1.5 },
  item: { marginBottom: 3 },
  note: { fontSize: 9, color: "#555", marginTop: 14 },
  footer: { marginTop: 36, alignItems: "center" },
  date: { fontSize: 12, marginBottom: 6 },
  by: { fontSize: 12 },
  photoTitle: { fontSize: 13, fontWeight: 700, marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  cell: { width: "48%", marginBottom: 14 },
  img: { width: "100%", height: 200, objectFit: "contain", borderWidth: 0.5, borderColor: "#999" },
  cap: { fontSize: 8.5, color: "#444", marginTop: 3, textAlign: "center" },
  unsupported: { fontSize: 9, color: "#a33", marginTop: 6 },
});

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <View style={s.value}>{children}</View>
    </View>
  );
}

export default function InspectionCert({ ctx }: { ctx: DocContext }) {
  const shown = ctx.photos.filter((p) => p.data);
  const unsupported = ctx.photos.filter((p) => !p.data);
  return (
    <Document title="검수(설치)완료확인서" author="과제관리 시스템">
      <Page size="A4" style={s.page}>
        <Text style={s.title}>검수(설치)완료확인서</Text>

        <Row label="1. 과제번호"><Text>{ctx.project.code}</Text></Row>
        <Row label="2. 과 제 명"><Text>{ctx.project.name}</Text></Row>
        <Row label="3. 구매품목">
          {ctx.items.length ? (
            ctx.items.map((it, i) => (
              <Text key={i} style={s.item}>
                - {it.name}
                {it.spec ? ` (${it.spec})` : ""} {it.quantity}개
              </Text>
            ))
          ) : (
            <Text>- {ctx.itemSummary}</Text>
          )}
        </Row>
        <Row label="4. 구매처"><Text>{ctx.vendor}</Text></Row>
        <Row label="5. 납품일자"><Text>{ctx.deliveryDate}</Text></Row>
        <Row label="6. 검수일자"><Text>{ctx.inspectionDate}</Text></Row>
        <Row label="7. 설치장소"><Text>{ctx.installLocation}</Text></Row>
        <Row label="8. 검수결과">
          <Text>주문 수량 및 규격과 일치하며, 외관·동작 이상 없음을 확인함</Text>
        </Row>
        <Row label="9. 검수자"><Text>{ctx.inspector}</Text></Row>
        {ctx.photos.length > 0 && (
          <Row label="붙임"><Text>검수 사진 {ctx.photos.length}매</Text></Row>
        )}

        <Text style={s.note}>※ 본 확인서는 전자결재(flex)로 승인되며 별도의 인장·서명을 생략함</Text>

        <View style={s.footer}>
          <Text style={s.date}>{ctx.today}</Text>
          <Text style={s.by}>검수자 {ctx.inspector}</Text>
        </View>
      </Page>

      {ctx.photos.length > 0 && (
        <Page size="A4" style={s.page}>
          <Text style={s.photoTitle}>붙임. 검수(납품·설치) 사진</Text>
          <View style={s.grid}>
            {shown.map((p, i) => (
              <View key={i} style={s.cell} wrap={false}>
                {/* react-pdf Image — HTML <img> 가 아니므로 alt 미지원 */}
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image style={s.img} src={p.data!} />
                <Text style={s.cap}>{i + 1}. {p.caption}</Text>
              </View>
            ))}
          </View>
          {unsupported.length > 0 && (
            <Text style={s.unsupported}>
              ※ PDF 삽입 불가 형식(JPG/PNG 만 지원) — 별도 첨부: {unsupported.map((p) => p.caption).join(", ")}
            </Text>
          )}
        </Page>
      )}
    </Document>
  );
}
