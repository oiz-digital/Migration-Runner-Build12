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

interface AIInvoice {
  invoiceNo: string;
  issuedAt: string;
  type: string;
  exchange: { name: string; legal: string; cin: string; address: string };
  user: { id: number; name: string; email: string };
  bot: {
    subscriptionId: number;
    planName: string;
    riskLevel: string | null;
    dailyReturnPercent: number | null;
    durationDays: number | null;
    status: string;
    statusLabel: string;
    payouts: number;
    startedAt: string | null;
    expiresAt: string | null;
    lastCreditedAt: string | null;
  };
  charges: { tdsEnabled: boolean; tdsRatePct: number; tdsNote: string };
  totals: {
    principalUsdt: number;
    grossProfitUsdt: number;
    tdsUsdt: number;
    netProfitUsdt: number;
    principalReturned: boolean;
    payoutUsdt: number;
    roiPct: number;
    principalInr: number;
    grossProfitInr: number;
    tdsInr: number;
    netProfitInr: number;
    payoutInr: number;
    inrRate: number;
  };
  legend: string;
}

const RISK_COLORS: Record<string, string> = {
  low: "#0ECB81",
  medium: "#eb9100",
  high: "#F6465D",
  extreme: "#a855f7",
};

function fmt(n: number, dp = 4) { return n.toFixed(dp); }
function fmtInr(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AIInvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const { data: inv, isLoading, error } = useQuery<AIInvoice>({
    queryKey: ["ai-invoice", id],
    queryFn: () => apiFetch(`/api/ai-trading/subscriptions/${id}/invoice`),
    enabled: !!id,
    staleTime: Infinity,
  });

  const profit = inv?.totals.netProfitUsdt ?? 0;
  const isProfit = profit >= 0;
  const riskColor = RISK_COLORS[(inv?.bot.riskLevel ?? "medium").toLowerCase()] ?? "#eb9100";

  async function handleShare() {
    if (!inv) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const text = [
      `🤖 Zebvix AI Trading Invoice`,
      `Invoice: ${inv.invoiceNo}`,
      `Date: ${new Date(inv.issuedAt).toLocaleString("en-IN")}`,
      ``,
      `Plan: ${inv.bot.planName} (${inv.bot.riskLevel ?? "—"} risk)`,
      `Status: ${inv.bot.statusLabel}`,
      ``,
      `Principal Invested: $${fmt(inv.totals.principalUsdt, 2)} (${fmtInr(inv.totals.principalInr)})`,
      `Gross Profit: $${fmt(inv.totals.grossProfitUsdt, 4)}`,
      `TDS (${inv.charges.tdsRatePct}%): −$${fmt(inv.totals.tdsUsdt, 4)}`,
      `Net Profit: $${fmt(inv.totals.netProfitUsdt, 4)}`,
      `ROI: ${inv.totals.roiPct.toFixed(2)}%`,
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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>AI Trading Statement</Text>
        <TouchableOpacity onPress={handleShare} style={styles.backBtn}>
          <Feather name="share-2" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading statement…</Text>
        </View>
      ) : error || !inv ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={40} color={colors.destructive} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Statement unavailable</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: botPt + 24 }}>

          {/* Hero Card */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <LinearGradient
              colors={[riskColor + "20", riskColor + "06", "transparent"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.invoiceHeader}>
              <View style={[styles.zbxBadge, { backgroundColor: riskColor }]}>
                <Feather name="cpu" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.exchangeName, { color: colors.foreground }]}>{inv.bot.planName}</Text>
                <Text style={[styles.invoiceType, { color: colors.mutedForeground }]}>AI Trading Statement & Tax Invoice</Text>
              </View>
              <View style={[styles.statusBadge, {
                backgroundColor: inv.bot.status === "active" ? "#22c55e20" : colors.muted,
              }]}>
                <Text style={[styles.statusText, {
                  color: inv.bot.status === "active" ? "#22c55e" : colors.mutedForeground,
                }]}>{inv.bot.status}</Text>
              </View>
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

            <View style={styles.partyRow}>
              <Feather name="user" size={14} color={colors.mutedForeground} />
              <View>
                <Text style={[styles.partyName, { color: colors.foreground }]}>{inv.user.name}</Text>
                <Text style={[styles.partyEmail, { color: colors.mutedForeground }]}>{inv.user.email}</Text>
              </View>
            </View>
          </View>

          {/* Bot Details */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Bot Details</Text>
            {[
              { label: "Subscription ID", value: `#${inv.bot.subscriptionId}` },
              { label: "Risk Level", value: inv.bot.riskLevel ?? "—" },
              { label: "Daily Return", value: inv.bot.dailyReturnPercent ? `${inv.bot.dailyReturnPercent}%` : "—" },
              { label: "Duration", value: inv.bot.durationDays ? `${inv.bot.durationDays} days` : "Perpetual" },
              { label: "Total Payouts", value: `${inv.bot.payouts} credits` },
              { label: "Started On", value: fmtDate(inv.bot.startedAt) },
              { label: "Expires On", value: inv.bot.expiresAt ? fmtDate(inv.bot.expiresAt) : "No expiry" },
              { label: "Last Credit", value: fmtDate(inv.bot.lastCreditedAt) },
              { label: "Status", value: inv.bot.statusLabel },
            ].map((r) => (
              <View key={r.label} style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{r.label}</Text>
                <Text style={[styles.detailValue, { color: colors.foreground }]}>{r.value}</Text>
              </View>
            ))}
          </View>

          {/* P&L Breakdown */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>P&L Statement</Text>

            <View style={[styles.chargeRow, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[styles.chargeName, { color: colors.foreground }]}>Principal Invested</Text>
                <Text style={[styles.chargeNote, { color: colors.mutedForeground }]}>
                  {inv.totals.principalReturned ? "Principal returned to wallet" : "Bot still active"}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.chargeAmt, { color: colors.foreground }]}>
                  ${fmt(inv.totals.principalUsdt, 2)}
                </Text>
                <Text style={[styles.chargeInr, { color: colors.mutedForeground }]}>
                  {fmtInr(inv.totals.principalInr)}
                </Text>
              </View>
            </View>

            <View style={[styles.chargeRow, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[styles.chargeName, { color: colors.foreground }]}>Gross Profit Earned</Text>
                <Text style={[styles.chargeNote, { color: colors.mutedForeground }]}>
                  Total credited over {inv.bot.payouts} payouts
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.chargeAmt, { color: "#0ECB81" }]}>
                  +${fmt(inv.totals.grossProfitUsdt)}
                </Text>
                <Text style={[styles.chargeInr, { color: colors.mutedForeground }]}>
                  {fmtInr(inv.totals.grossProfitInr)}
                </Text>
              </View>
            </View>

            <View style={[styles.chargeRow, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[styles.chargeName, { color: colors.foreground }]}>
                  TDS Deduction ({inv.charges.tdsRatePct}%)
                </Text>
                <Text style={[styles.chargeNote, { color: colors.mutedForeground }]}>
                  {inv.charges.tdsNote}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.chargeAmt, { color: "#F6465D" }]}>
                  −${fmt(inv.totals.tdsUsdt)}
                </Text>
                <Text style={[styles.chargeInr, { color: colors.mutedForeground }]}>
                  {fmtInr(inv.totals.tdsInr)}
                </Text>
              </View>
            </View>

            {/* Net P&L */}
            <LinearGradient
              colors={[isProfit ? "#0ECB8118" : "#F6465D18", "transparent"]}
              style={styles.netRow}
            >
              <View>
                <Text style={[styles.netLabel, { color: colors.foreground }]}>Net Profit</Text>
                <Text style={[styles.roiText, { color: isProfit ? "#0ECB81" : "#F6465D" }]}>
                  ROI: {isProfit ? "+" : ""}{inv.totals.roiPct.toFixed(2)}%
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.netUsdt, { color: isProfit ? "#0ECB81" : "#F6465D" }]}>
                  {isProfit ? "+" : ""}${fmt(inv.totals.netProfitUsdt)}
                </Text>
                <Text style={[styles.netInr, { color: isProfit ? "#0ECB81" : "#F6465D" }]}>
                  {fmtInr(inv.totals.netProfitInr)}
                </Text>
              </View>
            </LinearGradient>

            {/* Total payout row */}
            <View style={[styles.payoutRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Text style={[styles.payoutLabel, { color: colors.foreground }]}>Total Payout (incl. principal)</Text>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.payoutAmt, { color: colors.primary }]}>
                  ${fmt(inv.totals.payoutUsdt, 4)}
                </Text>
                <Text style={[styles.chargeInr, { color: colors.mutedForeground }]}>
                  {fmtInr(inv.totals.payoutInr)}
                </Text>
              </View>
            </View>
          </View>

          {/* INR note */}
          <View style={[styles.inrBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Feather name="info" size={13} color={colors.mutedForeground} />
            <Text style={[styles.inrNote, { color: colors.mutedForeground }]}>
              1 USDT = ₹{inv.totals.inrRate.toFixed(2)} · INR figures are indicative at time of statement generation
            </Text>
          </View>

          {/* Footer */}
          <View style={[styles.footerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.footerLine, { color: colors.mutedForeground }]}>{inv.exchange.legal}</Text>
            <Text style={[styles.footerLine, { color: colors.mutedForeground }]}>CIN: {inv.exchange.cin}</Text>
            <Text style={[styles.footerLine, { color: colors.mutedForeground }]}>{inv.exchange.address}</Text>
            <Text style={[styles.footerLine, { color: colors.mutedForeground }]}>
              Registered with FIU-IND under PMLA 2002 · TDS Sec 194S
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.shareBtn, { backgroundColor: riskColor }]}
            onPress={handleShare}
          >
            <Feather name={copied ? "check" : "share-2"} size={16} color="#fff" />
            <Text style={styles.shareBtnText}>{copied ? "Copied!" : "Share Statement"}</Text>
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
  exchangeName: { fontSize: 15, fontWeight: "800" },
  invoiceType: { fontSize: 11, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 12 },
  metaRow: { flexDirection: "row", justifyContent: "space-between" },
  metaLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
  metaValue: { fontSize: 14, fontWeight: "800", marginTop: 2 },
  partyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  partyName: { fontSize: 14, fontWeight: "700" },
  partyEmail: { fontSize: 12, marginTop: 1 },
  sectionTitle: { fontSize: 13, fontWeight: "800", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  detailLabel: { fontSize: 12, fontWeight: "500" },
  detailValue: { fontSize: 13, fontWeight: "700", textTransform: "capitalize" },
  chargeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  chargeName: { fontSize: 13, fontWeight: "600" },
  chargeNote: { fontSize: 11, marginTop: 2, maxWidth: 200 },
  chargeAmt: { fontSize: 13, fontWeight: "700" },
  chargeInr: { fontSize: 11, marginTop: 2 },
  netRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", padding: 14, marginTop: 6, borderRadius: 10 },
  netLabel: { fontSize: 15, fontWeight: "800" },
  roiText: { fontSize: 13, fontWeight: "700", marginTop: 2 },
  netUsdt: { fontSize: 18, fontWeight: "900" },
  netInr: { fontSize: 13, fontWeight: "700", marginTop: 2 },
  payoutRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12, borderRadius: 10, borderWidth: 1, marginTop: 8 },
  payoutLabel: { fontSize: 13, fontWeight: "600" },
  payoutAmt: { fontSize: 15, fontWeight: "800" },
  inrBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginTop: 12 },
  inrNote: { fontSize: 11, flex: 1, lineHeight: 16 },
  footerCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginTop: 12, gap: 4 },
  footerLine: { fontSize: 11, lineHeight: 18 },
  shareBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 14, marginTop: 16 },
  shareBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
