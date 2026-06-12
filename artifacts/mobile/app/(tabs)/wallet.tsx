import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useQuery } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { usePrices } from "@/hooks/usePrices";
import { apiFetch } from "@/hooks/useApi";
import { EmptyState } from "@/components/EmptyState";
import { AnimatedPrice } from "@/components/AnimatedPrice";

interface WalletItem { symbol: string; balance: string; locked: string; name?: string }
interface WalletResponse { wallets: WalletItem[] }

const COIN_COLORS: Record<string, string> = {
  BTC:"#f7931a",ETH:"#627eea",BNB:"#f3ba2f",XRP:"#346aa9",
  SOL:"#9945ff",ADA:"#3cc8c8",USDT:"#26a17b",INR:"#ff9933",
  MATIC:"#8247e5",AVAX:"#e84142",DOT:"#e6007a",LINK:"#2a5ada",
  DOGE:"#c2a633",DEFAULT:"#6b7a9e",
};

type Tab = "assets" | "history";

interface DonutSlice { pct: number; color: string }
function DonutChart({ slices, size = 80 }: { slices: DonutSlice[]; size?: number }) {
  const r = size / 2 - 6;
  const cx = size / 2;
  const cy = size / 2;
  const paths: { d: string; color: string }[] = [];
  let angleRad = -Math.PI / 2;
  const gap = 0.03;
  for (const s of slices) {
    if (s.pct < 0.01) continue;
    const sweep = s.pct * 2 * Math.PI - gap;
    const ir = r - 12;
    const x1o = cx + r * Math.cos(angleRad);
    const y1o = cy + r * Math.sin(angleRad);
    const x1i = cx + ir * Math.cos(angleRad);
    const y1i = cy + ir * Math.sin(angleRad);
    const endAngle = angleRad + sweep;
    const x2o = cx + r * Math.cos(endAngle);
    const y2o = cy + r * Math.sin(endAngle);
    const x2i = cx + ir * Math.cos(endAngle);
    const y2i = cy + ir * Math.sin(endAngle);
    const lg = sweep > Math.PI ? 1 : 0;
    paths.push({
      d: `M ${x1o} ${y1o} A ${r} ${r} 0 ${lg} 1 ${x2o} ${y2o} L ${x2i} ${y2i} A ${ir} ${ir} 0 ${lg} 0 ${x1i} ${y1i} Z`,
      color: s.color,
    });
    angleRad += sweep + gap;
  }
  return (
    <Svg width={size} height={size}>
      {paths.map((p, i) => (
        <Path key={i} d={p.d} fill={p.color} />
      ))}
    </Svg>
  );
}

export default function WalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { priceMap, inrRate } = usePrices();
  const [tab, setTab] = useState<Tab>("assets");
  const [hideBalance, setHideBalance] = useState(false);

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => apiFetch<WalletResponse>("/api/finance/wallet"),
    enabled: isAuthenticated,
    refetchInterval: 10_000,
  });

  const { data: txData, isLoading: txLoading, refetch: refetchTx } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => apiFetch<{ transactions: any[] }>("/api/finance/transaction?limit=30"),
    enabled: isAuthenticated && tab === "history",
  });

  const wallets = useMemo(() =>
    (data?.wallets ?? [])
      .map((w) => {
        const bal = parseFloat(w.balance) || 0;
        const tick = priceMap[w.symbol.toUpperCase()];
        const pxInr = w.symbol.toUpperCase() === "INR" ? 1 : tick?.inr ?? (tick?.usdt ?? 0) * inrRate;
        return { ...w, bal, valueInr: bal * pxInr };
      })
      .filter((w) => w.bal > 0)
      .sort((a, b) => b.valueInr - a.valueInr),
    [data, priceMap, inrRate]
  );

  const totalInr = useMemo(() => wallets.reduce((s, w) => s + w.valueInr, 0), [wallets]);
  const totalUsdt = totalInr / inrRate;

  const donutSlices: DonutSlice[] = useMemo(() => {
    if (totalInr === 0) return [];
    const top = wallets.slice(0, 6);
    const othersVal = wallets.slice(6).reduce((s, w) => s + w.valueInr, 0);
    const result = top.map((w) => ({
      pct: w.valueInr / totalInr,
      color: COIN_COLORS[w.symbol.toUpperCase()] ?? COIN_COLORS.DEFAULT,
    }));
    if (othersVal > 0) result.push({ pct: othersVal / totalInr, color: "#6b7a9e" });
    return result;
  }, [wallets, totalInr]);

  const QUICK_ACTIONS = [
    { icon: "arrow-down-circle" as const, label: "Deposit", color: "#0ECB81", onPress: () => {} },
    { icon: "arrow-up-circle" as const, label: "Withdraw", color: "#F6465D", onPress: () => {} },
    { icon: "repeat" as const, label: "Convert", color: "#eb9100", onPress: () => router.push("/convert" as any) },
    { icon: "send" as const, label: "Transfer", color: "#627eea", onPress: () => {} },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Wallet</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.muted }]} onPress={() => router.push("/orders")}>
            <Feather name="clock" size={17} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: botPt + 90 }}
        refreshControl={
          <RefreshControl
            refreshing={isLoading || txLoading}
            onRefresh={() => { void refetch(); void refetchTx(); }}
            tintColor={colors.primary}
          />
        }
      >
        {/* Balance card */}
        <LinearGradient
          colors={["#12260a", "#0d1524", "#080e1a"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.balCard, { borderBottomColor: colors.border }]}
        >
          <View style={styles.balTop}>
            <View style={{ flex: 1 }}>
              <View style={styles.balLabelRow}>
                <Text style={styles.balLabel}>Total Balance (INR)</Text>
                <TouchableOpacity onPress={() => setHideBalance((h) => !h)}>
                  <Feather name={hideBalance ? "eye-off" : "eye"} size={14} color="#6b7a9e" />
                </TouchableOpacity>
              </View>
              {isAuthenticated ? (
                <>
                  <AnimatedPrice
                    price={totalInr}
                    format={(p) => hideBalance ? "₹ •••••" : `₹${p.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
                    style={styles.balValue}
                  />
                  <Text style={styles.balSub}>
                    {hideBalance ? "≈ $•••••" : `≈ $${totalUsdt.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
                  </Text>
                </>
              ) : (
                <TouchableOpacity onPress={() => router.push("/login")}>
                  <Text style={[styles.balValue, { color: colors.primary }]}>Login to view</Text>
                </TouchableOpacity>
              )}
            </View>
            {isAuthenticated && donutSlices.length > 0 && (
              <View style={styles.donutWrap}>
                <DonutChart slices={donutSlices} size={80} />
              </View>
            )}
          </View>

          {/* Quick actions */}
          <View style={styles.quickRow}>
            {QUICK_ACTIONS.map((a) => (
              <TouchableOpacity key={a.label} style={styles.quickBtn} onPress={a.onPress}>
                <View style={[styles.quickIcon, { backgroundColor: a.color + "22" }]}>
                  <Feather name={a.icon} size={18} color={a.color} />
                </View>
                <Text style={[styles.quickLabel, { color: colors.mutedForeground }]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </LinearGradient>

        {/* Tabs */}
        <View style={[styles.tabRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          {([["assets", "Assets"], ["history", "History"]] as const).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[styles.tabBtn, tab === key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
              onPress={() => setTab(key)}
            >
              <Text style={[styles.tabLabel, { color: tab === key ? colors.primary : colors.mutedForeground }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === "assets" && (
          <>
            {!isAuthenticated ? (
              <EmptyState icon="lock" title="Login required" subtitle="Sign in to view your wallet" />
            ) : wallets.length === 0 && !isLoading ? (
              <EmptyState icon="credit-card" title="No assets yet" subtitle="Deposit to get started" />
            ) : (
              wallets.map((w) => {
                const bg = COIN_COLORS[w.symbol.toUpperCase()] ?? COIN_COLORS.DEFAULT;
                const pct = totalInr > 0 ? (w.valueInr / totalInr) * 100 : 0;
                const tick = priceMap[w.symbol.toUpperCase()];
                const change = tick?.change24h ?? 0;
                return (
                  <TouchableOpacity
                    key={w.symbol}
                    style={[styles.assetRow, { borderBottomColor: colors.border }]}
                    onPress={() => router.push(`/wallet/${w.symbol}` as any)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.coinIcon, { backgroundColor: bg + "22" }]}>
                      <Text style={[styles.coinLetter, { color: bg }]}>{w.symbol.charAt(0)}</Text>
                    </View>
                    <View style={styles.assetMid}>
                      <View style={styles.assetTopRow}>
                        <Text style={[styles.assetSym, { color: colors.foreground }]}>{w.symbol}</Text>
                        <Text style={[styles.assetBal, { color: colors.foreground }]}>
                          {hideBalance ? "••••" : (w.bal < 0.00001 ? w.bal.toExponential(2) : w.bal.toFixed(w.bal < 0.01 ? 6 : 4))}
                        </Text>
                      </View>
                      <View style={styles.assetBottomRow}>
                        <Text style={[styles.assetPct, { color: colors.mutedForeground }]}>{pct.toFixed(1)}%</Text>
                        <Text style={[styles.assetVal, { color: colors.mutedForeground }]}>
                          {hideBalance ? "₹•••••" : `₹${w.valueInr.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
                        </Text>
                      </View>
                      <View style={[styles.pctBar, { backgroundColor: colors.muted }]}>
                        <View style={[styles.pctFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: bg }]} />
                      </View>
                    </View>
                    <Text style={[styles.changeTag, { color: change >= 0 ? "#0ECB81" : "#F6465D" }]}>
                      {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </>
        )}

        {tab === "history" && (
          <>
            {!isAuthenticated ? (
              <EmptyState icon="lock" title="Login required" subtitle="Sign in to view transactions" />
            ) : (txData?.transactions ?? []).length === 0 && !txLoading ? (
              <EmptyState icon="activity" title="No transactions" subtitle="Your history will appear here" />
            ) : (
              (txData?.transactions ?? []).map((tx: any, i: number) => {
                const isCredit = tx.type === "deposit" || (tx.amount ?? 0) > 0;
                return (
                  <View key={i} style={[styles.txRow, { borderBottomColor: colors.border }]}>
                    <View style={[styles.txIcon, { backgroundColor: isCredit ? "#0ECB8120" : "#F6465D20" }]}>
                      <Feather name={isCredit ? "arrow-down-left" : "arrow-up-right"} size={16} color={isCredit ? "#0ECB81" : "#F6465D"} />
                    </View>
                    <View style={styles.txMid}>
                      <Text style={[styles.txType, { color: colors.foreground }]}>
                        {tx.type ? tx.type.charAt(0).toUpperCase() + tx.type.slice(1) : "Transaction"}
                      </Text>
                      <Text style={[styles.txDate, { color: colors.mutedForeground }]}>
                        {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString("en-IN") : ""}
                      </Text>
                    </View>
                    <Text style={[styles.txAmt, { color: isCredit ? "#0ECB81" : "#F6465D" }]}>
                      {isCredit ? "+" : "-"}{Math.abs(tx.amount ?? 0).toFixed(4)} {tx.currency ?? tx.symbol ?? ""}
                    </Text>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 22, fontWeight: "800" },
  headerRight: { flexDirection: "row", gap: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  balCard: { padding: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  balTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  balLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  balLabel: { color: "#6b7a9e", fontSize: 12 },
  balValue: { color: "#f8fafc", fontSize: 28, fontWeight: "900" },
  balSub: { color: "#6b7a9e", fontSize: 12, marginTop: 2 },
  donutWrap: { width: 80, height: 80, alignItems: "center", justifyContent: "center" },
  quickRow: { flexDirection: "row", justifyContent: "space-around" },
  quickBtn: { alignItems: "center", gap: 6 },
  quickIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  quickLabel: { fontSize: 11, fontWeight: "600" },
  tabRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabLabel: { fontSize: 13, fontWeight: "700" },
  assetRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  coinIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  coinLetter: { fontSize: 18, fontWeight: "700" },
  assetMid: { flex: 1, gap: 3 },
  assetTopRow: { flexDirection: "row", justifyContent: "space-between" },
  assetBottomRow: { flexDirection: "row", justifyContent: "space-between" },
  assetSym: { fontSize: 15, fontWeight: "700" },
  assetBal: { fontSize: 14, fontWeight: "600" },
  assetPct: { fontSize: 11 },
  assetVal: { fontSize: 12 },
  pctBar: { height: 2, borderRadius: 1, marginTop: 3 },
  pctFill: { height: 2, borderRadius: 1 },
  changeTag: { fontSize: 12, fontWeight: "700", minWidth: 52, textAlign: "right" },
  txRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  txIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  txMid: { flex: 1 },
  txType: { fontSize: 14, fontWeight: "600" },
  txDate: { fontSize: 12, marginTop: 2 },
  txAmt: { fontSize: 14, fontWeight: "700" },
});
