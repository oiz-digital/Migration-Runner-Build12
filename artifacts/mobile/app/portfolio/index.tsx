import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { usePrices } from "@/hooks/usePrices";
import { apiFetch } from "@/hooks/useApi";
import { EmptyState } from "@/components/EmptyState";
import { PriceChange } from "@/components/PriceChange";

interface WalletItem { symbol: string; balance: string; locked: string }
interface WalletResponse { wallets: WalletItem[] }

const COIN_COLORS: Record<string, string> = {
  BTC: "#f7931a", ETH: "#627eea", BNB: "#f3ba2f", XRP: "#346aa9",
  SOL: "#9945ff", ADA: "#3cc8c8", USDT: "#26a17b", INR: "#ff9933",
  MATIC: "#8247e5", AVAX: "#e84142", DOT: "#e6007a", LINK: "#2a5ada",
  DEFAULT: "#6b7a9e",
};

export default function PortfolioScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { priceMap, inrRate } = usePrices();

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const { data, isLoading } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => apiFetch<WalletResponse>("/api/finance/wallet"),
    enabled: isAuthenticated,
  });

  const assets = useMemo(() => {
    if (!data?.wallets) return [];
    return data.wallets
      .map((w) => {
        const bal = parseFloat(w.balance) || 0;
        const tick = priceMap[w.symbol.toUpperCase()];
        const pxUsdt = w.symbol.toUpperCase() === "USDT"
          ? 1
          : w.symbol.toUpperCase() === "INR"
            ? 1 / inrRate
            : (tick?.usdt ?? 0);
        const pxInr = w.symbol.toUpperCase() === "INR"
          ? 1
          : w.symbol.toUpperCase() === "USDT"
            ? inrRate
            : (tick?.inr ?? (tick?.usdt ?? 0) * inrRate);
        const valueUsdt = bal * pxUsdt;
        const valueInr = bal * pxInr;
        const change24h = tick?.change24h ?? 0;
        return { symbol: w.symbol, balance: bal, valueUsdt, valueInr, change24h, pxUsdt };
      })
      .filter((a) => a.valueUsdt > 0)
      .sort((a, b) => b.valueUsdt - a.valueUsdt);
  }, [data, priceMap, inrRate]);

  const totalUsdt = assets.reduce((s, a) => s + a.valueUsdt, 0);
  const totalInr = assets.reduce((s, a) => s + a.valueInr, 0);
  const portfolioChange24h = assets.length > 0
    ? assets.reduce((s, a) => s + a.change24h * (a.valueUsdt / totalUsdt), 0)
    : 0;
  const todayPnl = totalUsdt * (portfolioChange24h / 100);

  if (!isAuthenticated) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>Portfolio</Text>
          <View style={styles.backBtn} />
        </View>
        <EmptyState icon="lock" title="Login required" subtitle="Sign in to view your portfolio analytics" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Portfolio</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.push("/(tabs)/wallet" as any)}>
          <Feather name="credit-card" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: botPt + 20 }}>
          {/* Portfolio value card */}
          <LinearGradient
            colors={["#1a1200", "#0d1524"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.valueCard, { borderColor: "#2a1f00" }]}
          >
            <Text style={styles.valueLabel}>Total Portfolio Value</Text>
            <Text style={styles.valueAmount}>
              ₹{totalInr.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </Text>
            <Text style={styles.valueUsd}>
              ≈ ${totalUsdt.toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </Text>
            <View style={styles.pnlRow}>
              <View style={[styles.pnlBadge, { backgroundColor: portfolioChange24h >= 0 ? "#22c55e20" : "#e8151520" }]}>
                <Feather
                  name={portfolioChange24h >= 0 ? "trending-up" : "trending-down"}
                  size={13}
                  color={portfolioChange24h >= 0 ? "#22c55e" : "#e81515"}
                />
                <Text style={[styles.pnlText, { color: portfolioChange24h >= 0 ? "#22c55e" : "#e81515" }]}>
                  {portfolioChange24h >= 0 ? "+" : ""}${Math.abs(todayPnl).toFixed(2)} ({portfolioChange24h.toFixed(2)}%) Today
                </Text>
              </View>
            </View>
          </LinearGradient>

          {/* Allocation bars */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Asset Allocation</Text>

            {/* Visual bar */}
            <View style={styles.allocationBar}>
              {assets.slice(0, 6).map((a, i) => {
                const pct = totalUsdt > 0 ? (a.valueUsdt / totalUsdt) * 100 : 0;
                const bg = COIN_COLORS[a.symbol.toUpperCase()] ?? COIN_COLORS.DEFAULT;
                return (
                  <View
                    key={a.symbol}
                    style={{ flex: pct, backgroundColor: bg, borderRadius: i === 0 ? 4 : i === assets.length - 1 ? 4 : 0 }}
                  />
                );
              })}
            </View>

            {/* Legend */}
            <View style={styles.legend}>
              {assets.slice(0, 6).map((a) => {
                const pct = totalUsdt > 0 ? (a.valueUsdt / totalUsdt) * 100 : 0;
                const bg = COIN_COLORS[a.symbol.toUpperCase()] ?? COIN_COLORS.DEFAULT;
                return (
                  <View key={a.symbol} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: bg }]} />
                    <Text style={[styles.legendSym, { color: colors.foreground }]}>{a.symbol}</Text>
                    <Text style={[styles.legendPct, { color: colors.mutedForeground }]}>{pct.toFixed(1)}%</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Asset table */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderLabel, { color: colors.mutedForeground, flex: 1 }]}>Asset</Text>
            <Text style={[styles.tableHeaderLabel, { color: colors.mutedForeground, width: 80, textAlign: "right" }]}>Value</Text>
            <Text style={[styles.tableHeaderLabel, { color: colors.mutedForeground, width: 60, textAlign: "right" }]}>24h %</Text>
            <Text style={[styles.tableHeaderLabel, { color: colors.mutedForeground, width: 60, textAlign: "right" }]}>Share</Text>
          </View>

          <View style={[styles.table, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {assets.length === 0 ? (
              <View style={styles.tableEmpty}>
                <Text style={[styles.tableEmptyText, { color: colors.mutedForeground }]}>No assets to display</Text>
              </View>
            ) : assets.map((a, i) => {
              const pct = totalUsdt > 0 ? (a.valueUsdt / totalUsdt) * 100 : 0;
              const bg = COIN_COLORS[a.symbol.toUpperCase()] ?? COIN_COLORS.DEFAULT;
              return (
                <View key={a.symbol} style={[styles.tableRow, { borderBottomColor: colors.border }, i === assets.length - 1 && { borderBottomWidth: 0 }]}>
                  {/* Progress bar behind */}
                  <View style={[styles.tableRowBg, { width: `${pct}%`, backgroundColor: bg + "12" }]} />
                  <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={[styles.assetIcon, { backgroundColor: bg + "22" }]}>
                      <Text style={[styles.assetIconText, { color: bg }]}>{a.symbol.charAt(0)}</Text>
                    </View>
                    <View>
                      <Text style={[styles.assetSym, { color: colors.foreground }]}>{a.symbol}</Text>
                      <Text style={[styles.assetBal, { color: colors.mutedForeground }]}>
                        {a.balance.toFixed(a.balance < 0.01 ? 6 : 4)}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.assetValue, { color: colors.foreground }]}>
                    ${a.valueUsdt.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </Text>
                  <View style={{ width: 60, alignItems: "flex-end" }}>
                    <PriceChange value={a.change24h} fontSize={11} />
                  </View>
                  <Text style={[styles.assetShare, { color: colors.mutedForeground }]}>
                    {pct.toFixed(1)}%
                  </Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "700", textAlign: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  valueCard: { margin: 16, borderRadius: 18, padding: 22, borderWidth: 1 },
  valueLabel: { color: "#6b7a9e", fontSize: 13 },
  valueAmount: { color: "#f8fafc", fontSize: 30, fontWeight: "900", marginTop: 4 },
  valueUsd: { color: "#6b7a9e", fontSize: 14, marginTop: 2 },
  pnlRow: { marginTop: 12 },
  pnlBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, alignSelf: "flex-start" },
  pnlText: { fontSize: 13, fontWeight: "700" },
  section: { marginHorizontal: 16, borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginBottom: 12 },
  allocationBar: { flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", marginBottom: 14, gap: 1 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendSym: { fontSize: 12, fontWeight: "600" },
  legendPct: { fontSize: 12 },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tableHeaderLabel: { fontSize: 10, fontWeight: "600", textTransform: "uppercase" },
  table: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    position: "relative",
    gap: 0,
  },
  tableRowBg: { position: "absolute", left: 0, top: 0, bottom: 0 },
  tableEmpty: { padding: 24, alignItems: "center" },
  tableEmptyText: { fontSize: 14 },
  assetIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  assetIconText: { fontSize: 14, fontWeight: "700" },
  assetSym: { fontSize: 13, fontWeight: "700" },
  assetBal: { fontSize: 11, marginTop: 1 },
  assetValue: { width: 80, fontSize: 13, fontWeight: "600", textAlign: "right" },
  assetShare: { width: 60, fontSize: 12, textAlign: "right" },
});
