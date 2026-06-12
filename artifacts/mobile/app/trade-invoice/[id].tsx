import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/hooks/useApi";

interface TradeInvoice {
  invoiceNo: string;
  issuedAt: string;
  exchange: { name: string; short: string; legal: string; cin: string; gst: string; address: string };
  user: { id: number; name: string; email: string };
  order: {
    id: number; symbol: string; side: string; type: string; status: string;
    quantity: number; filledQty: number; avgFillPrice: number; createdAt: string;
  };
  charges: { tdsEnabled: boolean; tdsRatePct: number; feeRatePct: number };
  totals: {
    grossUsdt: number; feeUsdt: number; tdsUsdt: number; netUsdt: number;
    grossInr: number; feeInr: number; tdsInr: number; netInr: number; inrRate: number;
  };
  legend: string;
}

function fmt(n: number, dp = 4) { return n.toFixed(dp); }
function fmtInr(n: number) { return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

export default function TradeInvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const { data: inv, isLoading, error } = useQuery<TradeInvoice>({
    queryKey: ["trade-invoice", id],
    queryFn: () => apiFetch(`/api/orders/${id}/invoice`),
    enabled: !!id,
    staleTime: Infinity,
  });

  const isBuy = inv?.order.side === "buy";
  const sideColor = isBuy ? "#0ECB81" : "#F6465D";
  const sideLabel = isBuy ? "BUY" : "SELL";

  async function handleShare() {
    if (!inv) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const text = [
      `📄 Zebvix Trade Invoice`,
      `Invoice: ${inv.invoiceNo}`,
      `Date: ${new Date(inv.issuedAt).toLocaleString("en-IN")}`,
      ``,
      `Pair: ${inv.order.symbol} | ${sideLabel}`,
      `Filled: ${fmt(inv.order.filledQty)} @ $${fmt(inv.order.avgFillPrice, 2)}`,
      `Gross: $${fmt(inv.totals.grossUsdt)} (${fmtInr(inv.totals.grossInr)})`,
      `Fee (${inv.charges.feeRatePct}%): $${fmt(inv.totals.feeUsdt)}`,
      `TDS (${inv.charges.tdsRatePct}%): $${fmt(inv.totals.tdsUsdt)}`,
      `Net: $${fmt(inv.totals.netUsdt)} (${fmtInr(inv.totals.netInr)})`,
      ``,
      `Zebvix Exchange · CIN: ${inv.exchange.cin}`,
    ].join("\n");

    try {
      await Share.share({ message: text, title: inv.invoiceNo });
    } catch {
      await Clipboard.setStringAsync(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Trade Receipt</Text>
        <TouchableOpacity onPress={handleShare} style={styles.backBtn}>
          <Feather name="share-2" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading invoice…</Text>
        </View>
      ) : error || !inv ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={40} color={colors.destructive} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Invoice not available</Text>
          <Text style={[styles.subText, { color: colors.mutedForeground }]}>Only available for filled orders</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: botPt + 24 }}>

          {/* Hero Card */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <LinearGradient
              colors={["#eb910018", "#eb910006", "transparent"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />

            {/* Header stripe */}
            <View style={styles.invoiceHeader}>
              <View style={styles.zbxBadge}>
                <Text style={styles.zbxText}>ZBX</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.exchangeName, { color: colors.foreground }]}>Zebvix Exchange</Text>
                <Text style={[styles.invoiceType, { color: colors.mutedForeground }]}>Spot Trading Tax Invoice</Text>
              </View>
              <View style={[styles.statusDot, { backgroundColor: isBuy ? "#0ECB81" : "#F6465D" }]} />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Invoice meta */}
            <View style={styles.metaRow}>
              <View>
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>INVOICE NO.</Text>
                <Text style={[styles.metaValue, { color: colors.foreground }]}>{inv.invoiceNo}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>DATE & TIME</Text>
                <Text style={[styles.metaValue, { color: colors.foreground }]}>
                  {new Date(inv.issuedAt).toLocaleDateString("en-IN")}
                </Text>
                <Text style={[styles.metaSmall, { color: colors.mutedForeground }]}>
                  {new Date(inv.issuedAt).toLocaleTimeString("en-IN")}
                </Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* User */}
            <View style={styles.partyRow}>
              <Feather name="user" size={14} color={colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.partyName, { color: colors.foreground }]}>{inv.user.name}</Text>
                <Text style={[styles.partyEmail, { color: colors.mutedForeground }]}>{inv.user.email}</Text>
              </View>
              <View style={[styles.sidePill, { backgroundColor: sideColor + "22" }]}>
                <Text style={[styles.sidePillText, { color: sideColor }]}>{sideLabel}</Text>
              </View>
            </View>
          </View>

          {/* Order Details */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Order Details</Text>
            {[
              { label: "Symbol", value: inv.order.symbol },
              { label: "Order ID", value: `#${inv.order.id}` },
              { label: "Type", value: inv.order.type.charAt(0).toUpperCase() + inv.order.type.slice(1) },
              { label: "Quantity (requested)", value: fmt(inv.order.quantity) },
              { label: "Filled Quantity", value: fmt(inv.order.filledQty) },
              { label: "Avg. Fill Price", value: `$${fmt(inv.order.avgFillPrice, 2)}` },
              { label: "Order Date", value: new Date(inv.order.createdAt).toLocaleString("en-IN") },
            ].map((r) => (
              <View key={r.label} style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{r.label}</Text>
                <Text style={[styles.detailValue, { color: colors.foreground }]}>{r.value}</Text>
              </View>
            ))}
          </View>

          {/* Charges Breakdown */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Charges Breakdown</Text>

            <View style={[styles.chargeRow, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[styles.chargeName, { color: colors.foreground }]}>Gross Trade Value</Text>
                <Text style={[styles.chargeNote, { color: colors.mutedForeground }]}>
                  {fmt(inv.order.filledQty)} × ${fmt(inv.order.avgFillPrice, 2)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.chargeAmt, { color: colors.foreground }]}>${fmt(inv.totals.grossUsdt)}</Text>
                <Text style={[styles.chargeInr, { color: colors.mutedForeground }]}>{fmtInr(inv.totals.grossInr)}</Text>
              </View>
            </View>

            <View style={[styles.chargeRow, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[styles.chargeName, { color: colors.foreground }]}>
                  Trading Fee ({inv.charges.feeRatePct}%)
                </Text>
                <Text style={[styles.chargeNote, { color: colors.mutedForeground }]}>Platform transaction fee</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.chargeAmt, { color: "#F6465D" }]}>−${fmt(inv.totals.feeUsdt)}</Text>
                <Text style={[styles.chargeInr, { color: colors.mutedForeground }]}>{fmtInr(inv.totals.feeInr)}</Text>
              </View>
            </View>

            {inv.charges.tdsEnabled && (
              <View style={[styles.chargeRow, { borderBottomColor: colors.border }]}>
                <View>
                  <Text style={[styles.chargeName, { color: colors.foreground }]}>
                    TDS Deduction ({inv.charges.tdsRatePct}%)
                  </Text>
                  <Text style={[styles.chargeNote, { color: colors.mutedForeground }]}>
                    Sec 194S PMLA — VDA transfer tax
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.chargeAmt, { color: "#F6465D" }]}>−${fmt(inv.totals.tdsUsdt)}</Text>
                  <Text style={[styles.chargeInr, { color: colors.mutedForeground }]}>{fmtInr(inv.totals.tdsInr)}</Text>
                </View>
              </View>
            )}

            {/* Net Total */}
            <LinearGradient
              colors={[isBuy ? "#0ECB8118" : "#F6465D18", "transparent"]}
              style={styles.netRow}
            >
              <View>
                <Text style={[styles.netLabel, { color: colors.foreground }]}>Net {isBuy ? "Cost" : "Proceeds"}</Text>
                <Text style={[styles.chargeNote, { color: colors.mutedForeground }]}>{inv.legend}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.netUsdt, { color: isBuy ? "#F6465D" : "#0ECB81" }]}>
                  ${fmt(inv.totals.netUsdt, 4)}
                </Text>
                <Text style={[styles.netInr, { color: isBuy ? "#F6465D" : "#0ECB81" }]}>
                  {fmtInr(inv.totals.netInr)}
                </Text>
              </View>
            </LinearGradient>
          </View>

          {/* INR Rate */}
          <View style={[styles.inrBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Feather name="info" size={13} color={colors.mutedForeground} />
            <Text style={[styles.inrNote, { color: colors.mutedForeground }]}>
              1 USDT = ₹{inv.totals.inrRate.toFixed(2)} · INR amounts are indicative at time of invoice
            </Text>
          </View>

          {/* Footer stamp */}
          <View style={[styles.footerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.footerLine, { color: colors.mutedForeground }]}>{inv.exchange.legal}</Text>
            <Text style={[styles.footerLine, { color: colors.mutedForeground }]}>CIN: {inv.exchange.cin}</Text>
            <Text style={[styles.footerLine, { color: colors.mutedForeground }]}>GSTIN: {inv.exchange.gst}</Text>
            <Text style={[styles.footerLine, { color: colors.mutedForeground }]}>{inv.exchange.address}</Text>
            <Text style={[styles.footerLine, { color: colors.mutedForeground }]}>Registered with FIU-IND under PMLA 2002</Text>
          </View>

          {/* Copy button */}
          <TouchableOpacity
            style={[styles.shareBtn, { backgroundColor: colors.primary }]}
            onPress={handleShare}
          >
            <Feather name={copied ? "check" : "share-2"} size={16} color="#fff" />
            <Text style={styles.shareBtnText}>{copied ? "Copied!" : "Share Invoice"}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "700", textAlign: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 15, fontWeight: "600" },
  subText: { fontSize: 13 },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden", padding: 16 },
  invoiceHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  zbxBadge: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#eb9100", alignItems: "center", justifyContent: "center" },
  zbxText: { color: "#fff", fontSize: 14, fontWeight: "900", letterSpacing: 1 },
  exchangeName: { fontSize: 15, fontWeight: "800" },
  invoiceType: { fontSize: 11, marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 12 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  metaLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
  metaValue: { fontSize: 14, fontWeight: "800", marginTop: 2 },
  metaSmall: { fontSize: 11, marginTop: 1 },
  partyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  partyName: { fontSize: 14, fontWeight: "700" },
  partyEmail: { fontSize: 12, marginTop: 1 },
  sidePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  sidePillText: { fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  sectionTitle: { fontSize: 13, fontWeight: "800", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  detailLabel: { fontSize: 12, fontWeight: "500" },
  detailValue: { fontSize: 13, fontWeight: "700" },
  chargeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  chargeName: { fontSize: 13, fontWeight: "600" },
  chargeNote: { fontSize: 11, marginTop: 2 },
  chargeAmt: { fontSize: 13, fontWeight: "700" },
  chargeInr: { fontSize: 11, marginTop: 2 },
  netRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", padding: 14, marginTop: 4, borderRadius: 10 },
  netLabel: { fontSize: 15, fontWeight: "800" },
  netUsdt: { fontSize: 18, fontWeight: "900" },
  netInr: { fontSize: 13, fontWeight: "700", marginTop: 2 },
  inrBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginTop: 12 },
  inrNote: { fontSize: 11, flex: 1, lineHeight: 16 },
  footerCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginTop: 12, gap: 4 },
  footerLine: { fontSize: 11, lineHeight: 18 },
  shareBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 14, marginTop: 16 },
  shareBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
