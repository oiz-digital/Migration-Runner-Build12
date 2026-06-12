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

interface FuturesInvoice {
  invoiceNo: string;
  issuedAt: string;
  exchange: { name: string; legal: string; cin: string; address: string };
  user: { id: number; name: string; email: string };
  position: {
    id: number; symbol: string; side: string;
    qty: number; leverage: number;
    entryPrice: number; markPrice: number;
    margin: number; status: string;
    openedAt: string | null; closedAt: string | null;
    closeReason: string | null;
  };
  charges: { feeRatePct: number; feeNote: string };
  totals: {
    openNotionalUsdt: number;
    closeNotionalUsdt: number;
    marginUsdt: number;
    grossPnlUsdt: number;
    feeUsdt: number;
    netPnlUsdt: number;
    openNotionalInr: number;
    marginInr: number;
    grossPnlInr: number;
    feeInr: number;
    netPnlInr: number;
    inrRate: number;
  };
  legend: string;
}

function fmt(n: number, dp = 4) { return n.toFixed(dp); }
function fmtInr(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function FuturesInvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const { data: inv, isLoading, error } = useQuery<FuturesInvoice>({
    queryKey: ["futures-invoice", id],
    queryFn: () => apiFetch(`/api/futures/positions/${id}/invoice`),
    enabled: !!id,
    staleTime: Infinity,
  });

  const netPnl = inv?.totals.netPnlUsdt ?? 0;
  const isProfit = netPnl >= 0;
  const pnlColor = isProfit ? "#0ECB81" : "#F6465D";
  const isLong = inv?.position.side === "long";
  const sideColor = isLong ? "#0ECB81" : "#F6465D";
  const isOpen = inv?.position.status === "open";

  async function handleShare() {
    if (!inv) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const text = [
      `📊 Zebvix Futures Invoice`,
      `Invoice: ${inv.invoiceNo}`,
      `Date: ${new Date(inv.issuedAt).toLocaleString("en-IN")}`,
      ``,
      `Symbol: ${inv.position.symbol} | ${inv.position.side.toUpperCase()} ${inv.position.leverage}x`,
      `Entry: $${fmt(inv.position.entryPrice, 2)} → Exit: $${fmt(inv.position.markPrice, 2)}`,
      `Size: ${fmt(inv.position.qty)} · Margin: $${fmt(inv.totals.marginUsdt, 2)}`,
      ``,
      `Gross P&L: ${netPnl >= 0 ? "+" : ""}$${fmt(inv.totals.grossPnlUsdt)}`,
      `Fee (${inv.charges.feeRatePct}%): −$${fmt(inv.totals.feeUsdt)}`,
      `Net P&L: ${isProfit ? "+" : ""}$${fmt(inv.totals.netPnlUsdt)} (${fmtInr(inv.totals.netPnlInr)})`,
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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Futures Receipt</Text>
        <TouchableOpacity onPress={handleShare} style={styles.backBtn}>
          <Feather name="share-2" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading receipt…</Text>
        </View>
      ) : error || !inv ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={40} color={colors.destructive} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Receipt unavailable</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: botPt + 24 }}>

          {/* Hero Card */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <LinearGradient
              colors={[pnlColor + "20", pnlColor + "06", "transparent"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />

            <View style={styles.invoiceHeader}>
              <View style={[styles.zbxBadge, { backgroundColor: "#eb9100" }]}>
                <Text style={styles.zbxText}>ZBX</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.exchangeName, { color: colors.foreground }]}>Zebvix Futures</Text>
                <Text style={[styles.invoiceType, { color: colors.mutedForeground }]}>Position Settlement Invoice</Text>
              </View>
              {isOpen && (
                <View style={[styles.openBadge, { backgroundColor: "#eb910020" }]}>
                  <Text style={[styles.openBadgeText, { color: "#eb9100" }]}>LIVE</Text>
                </View>
              )}
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.metaRow}>
              <View>
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>INVOICE NO.</Text>
                <Text style={[styles.metaValue, { color: colors.foreground }]}>{inv.invoiceNo}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>ISSUED ON</Text>
                <Text style={[styles.metaValue, { color: colors.foreground }]}>
                  {new Date(inv.issuedAt).toLocaleDateString("en-IN")}
                </Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Symbol + side pill */}
            <View style={styles.symbolRow}>
              <Text style={[styles.symbolText, { color: colors.foreground }]}>{inv.position.symbol}</Text>
              <View style={styles.pillsRow}>
                <View style={[styles.pill, { backgroundColor: sideColor + "22" }]}>
                  <Feather name={isLong ? "trending-up" : "trending-down"} size={11} color={sideColor} />
                  <Text style={[styles.pillText, { color: sideColor }]}>{isLong ? "LONG" : "SHORT"}</Text>
                </View>
                <View style={[styles.pill, { backgroundColor: "#eb910022" }]}>
                  <Text style={[styles.pillText, { color: "#eb9100" }]}>{inv.position.leverage}×</Text>
                </View>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.partyRow}>
              <Feather name="user" size={14} color={colors.mutedForeground} />
              <View>
                <Text style={[styles.partyName, { color: colors.foreground }]}>{inv.user.name}</Text>
                <Text style={[styles.partyEmail, { color: colors.mutedForeground }]}>{inv.user.email}</Text>
              </View>
            </View>
          </View>

          {/* Position Details */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Position Details</Text>
            {[
              { label: "Position ID", value: `#${inv.position.id}` },
              { label: "Symbol", value: inv.position.symbol },
              { label: "Direction", value: isLong ? "Long (Buy)" : "Short (Sell)" },
              { label: "Leverage", value: `${inv.position.leverage}×` },
              { label: "Size (qty)", value: fmt(inv.position.qty) },
              { label: "Entry Price", value: `$${fmt(inv.position.entryPrice, 2)}` },
              { label: isOpen ? "Mark Price (live)" : "Exit Price", value: `$${fmt(inv.position.markPrice, 2)}` },
              { label: "Margin Used", value: `$${fmt(inv.totals.marginUsdt, 2)} (${fmtInr(inv.totals.marginInr)})` },
              { label: "Opened On", value: fmtDate(inv.position.openedAt) },
              { label: "Closed On", value: inv.position.closedAt ? fmtDate(inv.position.closedAt) : isOpen ? "Still open" : "—" },
              { label: "Close Reason", value: inv.position.closeReason ?? (isOpen ? "Still active" : "—") },
            ].map((r) => (
              <View key={r.label} style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{r.label}</Text>
                <Text style={[styles.detailValue, { color: colors.foreground }]}>{r.value}</Text>
              </View>
            ))}
          </View>

          {/* P&L Breakdown */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {isOpen ? "Unrealized P&L Breakdown" : "Settlement Breakdown"}
            </Text>

            <View style={[styles.chargeRow, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[styles.chargeName, { color: colors.foreground }]}>Open Notional</Text>
                <Text style={[styles.chargeNote, { color: colors.mutedForeground }]}>
                  {fmt(inv.position.qty)} × ${fmt(inv.position.entryPrice, 2)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.chargeAmt, { color: colors.foreground }]}>
                  ${fmt(inv.totals.openNotionalUsdt, 2)}
                </Text>
                <Text style={[styles.chargeInr, { color: colors.mutedForeground }]}>
                  {fmtInr(inv.totals.openNotionalInr)}
                </Text>
              </View>
            </View>

            <View style={[styles.chargeRow, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[styles.chargeName, { color: colors.foreground }]}>Close Notional</Text>
                <Text style={[styles.chargeNote, { color: colors.mutedForeground }]}>
                  {fmt(inv.position.qty)} × ${fmt(inv.position.markPrice, 2)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.chargeAmt, { color: colors.foreground }]}>
                  ${fmt(inv.totals.closeNotionalUsdt, 2)}
                </Text>
              </View>
            </View>

            <View style={[styles.chargeRow, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[styles.chargeName, { color: colors.foreground }]}>Gross P&L</Text>
                <Text style={[styles.chargeNote, { color: colors.mutedForeground }]}>
                  Before deducting trading fee
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.chargeAmt, { color: inv.totals.grossPnlUsdt >= 0 ? "#0ECB81" : "#F6465D" }]}>
                  {inv.totals.grossPnlUsdt >= 0 ? "+" : ""}${fmt(inv.totals.grossPnlUsdt)}
                </Text>
                <Text style={[styles.chargeInr, { color: colors.mutedForeground }]}>
                  {fmtInr(inv.totals.grossPnlInr)}
                </Text>
              </View>
            </View>

            <View style={[styles.chargeRow, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[styles.chargeName, { color: colors.foreground }]}>
                  Trading Fee ({inv.charges.feeRatePct}%)
                </Text>
                <Text style={[styles.chargeNote, { color: colors.mutedForeground }]}>
                  {inv.charges.feeNote}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.chargeAmt, { color: "#F6465D" }]}>
                  −${fmt(inv.totals.feeUsdt)}
                </Text>
                <Text style={[styles.chargeInr, { color: colors.mutedForeground }]}>
                  {fmtInr(inv.totals.feeInr)}
                </Text>
              </View>
            </View>

            {/* Net P&L — big highlight */}
            <LinearGradient
              colors={[pnlColor + "20", pnlColor + "05", "transparent"]}
              style={styles.netRow}
            >
              <View>
                <Text style={[styles.netLabel, { color: colors.foreground }]}>
                  Net {isProfit ? "Profit" : "Loss"}
                </Text>
                <Text style={[styles.chargeNote, { color: colors.mutedForeground }]}>{inv.legend}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.netUsdt, { color: pnlColor }]}>
                  {isProfit ? "+" : ""}${fmt(inv.totals.netPnlUsdt)}
                </Text>
                <Text style={[styles.netInr, { color: pnlColor }]}>
                  {fmtInr(inv.totals.netPnlInr)}
                </Text>
              </View>
            </LinearGradient>
          </View>

          {/* INR note */}
          <View style={[styles.inrBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Feather name="info" size={13} color={colors.mutedForeground} />
            <Text style={[styles.inrNote, { color: colors.mutedForeground }]}>
              1 USDT = ₹{inv.totals.inrRate.toFixed(2)} · Fee is estimated on open + close notional at {inv.charges.feeRatePct}% taker rate
            </Text>
          </View>

          {/* Footer */}
          <View style={[styles.footerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.footerLine, { color: colors.mutedForeground }]}>{inv.exchange.legal}</Text>
            <Text style={[styles.footerLine, { color: colors.mutedForeground }]}>CIN: {inv.exchange.cin}</Text>
            <Text style={[styles.footerLine, { color: colors.mutedForeground }]}>{inv.exchange.address}</Text>
            <Text style={[styles.footerLine, { color: colors.mutedForeground }]}>Registered with FIU-IND under PMLA 2002</Text>
          </View>

          <TouchableOpacity
            style={[styles.shareBtn, { backgroundColor: pnlColor }]}
            onPress={handleShare}
          >
            <Feather name={copied ? "check" : "share-2"} size={16} color="#fff" />
            <Text style={styles.shareBtnText}>{copied ? "Copied!" : "Share Receipt"}</Text>
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
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden", padding: 16 },
  invoiceHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  zbxBadge: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  zbxText: { color: "#fff", fontSize: 14, fontWeight: "900", letterSpacing: 1 },
  exchangeName: { fontSize: 15, fontWeight: "800" },
  invoiceType: { fontSize: 11, marginTop: 2 },
  openBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  openBadgeText: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 12 },
  metaRow: { flexDirection: "row", justifyContent: "space-between" },
  metaLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
  metaValue: { fontSize: 14, fontWeight: "800", marginTop: 2 },
  symbolRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  symbolText: { fontSize: 20, fontWeight: "900", letterSpacing: 0.5 },
  pillsRow: { flexDirection: "row", gap: 6 },
  pill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, gap: 4 },
  pillText: { fontSize: 11, fontWeight: "800" },
  partyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  partyName: { fontSize: 14, fontWeight: "700" },
  partyEmail: { fontSize: 12, marginTop: 1 },
  sectionTitle: { fontSize: 13, fontWeight: "800", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  detailLabel: { fontSize: 12, fontWeight: "500", flex: 1 },
  detailValue: { fontSize: 13, fontWeight: "700", textAlign: "right", flex: 1 },
  chargeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  chargeName: { fontSize: 13, fontWeight: "600" },
  chargeNote: { fontSize: 11, marginTop: 2, maxWidth: 190 },
  chargeAmt: { fontSize: 13, fontWeight: "700" },
  chargeInr: { fontSize: 11, marginTop: 2 },
  netRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", padding: 14, marginTop: 6, borderRadius: 10 },
  netLabel: { fontSize: 15, fontWeight: "800" },
  netUsdt: { fontSize: 22, fontWeight: "900" },
  netInr: { fontSize: 13, fontWeight: "700", marginTop: 2 },
  inrBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginTop: 12 },
  inrNote: { fontSize: 11, flex: 1, lineHeight: 16 },
  footerCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginTop: 12, gap: 4 },
  footerLine: { fontSize: 11, lineHeight: 18 },
  shareBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 14, marginTop: 16 },
  shareBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
