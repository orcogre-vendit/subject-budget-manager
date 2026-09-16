// 품의서(구매의뢰서 겸용) PDF — 서버 전용(react-pdf)
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { PDF_FONT } from "./font";
import { n, type DocContext } from "@/lib/templates/types";

const s = StyleSheet.create({
  page: { fontFamily: PDF_FONT, fontSize: 10.5, paddingTop: 52, paddingHorizontal: 52, paddingBottom: 48, color: "#111" },
  title: { fontSize: 19, fontWeight: 700, textAlign: "center", letterSpacing: 5, marginBottom: 26 },
  h: { fontWeight: 700, marginTop: 12, marginBottom: 5 },
  kv: { flexDirection: "row", marginBottom: 3 },
  k: { width: 78 },
  v: { flex: 1, lineHeight: 1.45 },
  table: { borderWidth: 0.8, borderColor: "#333", marginTop: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.6, borderColor: "#666" },
  trLast: { flexDirection: "row" },
  th: { backgroundColor: "#eee", fontWeight: 700, paddingVertical: 4, paddingHorizontal: 5, borderRightWidth: 0.6, borderColor: "#666" },
  td: { paddingVertical: 4, paddingHorizontal: 5, borderRightWidth: 0.6, borderColor: "#666" },
  last: { borderRightWidth: 0 },
  cName: { width: "38%" },
  cSpec: { width: "22%" },
  cQty: { width: "10%", textAlign: "right" },
  cUnit: { width: "15%", textAlign: "right" },
  cAmt: { width: "15%", textAlign: "right" },
  sums: { marginTop: 6, alignItems: "flex-end" },
  sumRow: { flexDirection: "row", marginBottom: 2 },
  sumK: { width: 90, textAlign: "right", marginRight: 10 },
  sumV: { width: 100, textAlign: "right" },
  note: { fontSize: 9, color: "#555", marginTop: 2 },
  sign: { marginTop: 34, alignItems: "center" },
  signRow: { flexDirection: "row", gap: 40, marginTop: 14 },
});

export default function PurchaseRequest({ ctx }: { ctx: DocContext }) {
  const rows = ctx.items.length
    ? ctx.items
    : [{ name: ctx.itemSummary, spec: "", quantity: 1, unitPrice: ctx.supplyAmount, amount: ctx.supplyAmount }];
  return (
    <Document title="구매의뢰서(품의서)" author="과제관리 시스템">
      <Page size="A4" style={s.page}>
        <Text style={s.title}>구매의뢰서 (품의서)</Text>

        <Text style={s.h}>1. 과제정보</Text>
        <View style={s.kv}><Text style={s.k}>과제번호</Text><Text style={s.v}>{ctx.project.code}</Text></View>
        <View style={s.kv}><Text style={s.k}>과 제 명</Text><Text style={s.v}>{ctx.project.name}</Text></View>
        <View style={s.kv}><Text style={s.k}>비    목</Text><Text style={s.v}>{ctx.budgetPath}</Text></View>

        <Text style={s.h}>2. 구매 내역</Text>
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, s.cName]}>품목명</Text>
            <Text style={[s.th, s.cSpec]}>규격</Text>
            <Text style={[s.th, s.cQty]}>수량</Text>
            <Text style={[s.th, s.cUnit]}>단가(원)</Text>
            <Text style={[s.th, s.cAmt, s.last]}>금액(원)</Text>
          </View>
          {rows.map((it, i) => (
            <View key={i} style={i === rows.length - 1 ? s.trLast : s.tr}>
              <Text style={[s.td, s.cName]}>{it.name}</Text>
              <Text style={[s.td, s.cSpec]}>{it.spec || "-"}</Text>
              <Text style={[s.td, s.cQty]}>{n(it.quantity)}</Text>
              <Text style={[s.td, s.cUnit]}>{n(it.unitPrice)}</Text>
              <Text style={[s.td, s.cAmt, s.last]}>{n(it.amount)}</Text>
            </View>
          ))}
        </View>
        <View style={s.sums}>
          <View style={s.sumRow}><Text style={s.sumK}>공급가액 합계</Text><Text style={s.sumV}>{n(ctx.supplyAmount)}원</Text></View>
          <View style={s.sumRow}><Text style={s.sumK}>부가가치세</Text><Text style={s.sumV}>{n(ctx.vatAmount)}원</Text></View>
          <View style={s.sumRow}><Text style={[s.sumK, { fontWeight: 700 }]}>총액</Text><Text style={[s.sumV, { fontWeight: 700 }]}>{n(ctx.totalAmount)}원</Text></View>
          <Text style={s.note}>※ 부가가치세는 회사 자금으로 지급하며 연구비에 계상하지 않음</Text>
        </View>

        <Text style={s.h}>3. 구매 사유 (과제와의 직접적 관련성)</Text>
        <Text style={s.v}>{ctx.purpose}</Text>

        <View style={{ marginTop: 12 }}>
          <View style={s.kv}><Text style={s.k}>4. 구매처</Text><Text style={s.v}>{ctx.vendor}</Text></View>
          <View style={s.kv}><Text style={s.k}>5. 결제수단</Text><Text style={s.v}>{ctx.paymentMethod}  (연구비카드 / RCMS 계좌이체)</Text></View>
          <View style={s.kv}><Text style={s.k}>6. 구매(예정)일</Text><Text style={s.v}>{ctx.purchaseDate}</Text></View>
        </View>

        <Text style={[s.note, { marginTop: 14 }]}>※ 본 품의는 전자결재(flex)로 승인되며 별도의 인장·서명을 생략함</Text>

        <View style={s.sign}>
          <Text>{ctx.today}</Text>
          <View style={s.signRow}>
            <Text>요청자 : {ctx.requester}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
