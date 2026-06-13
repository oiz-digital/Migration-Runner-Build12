import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { usePrices } from "@/hooks/usePrices";
import { apiFetch } from "@/hooks/useApi";
import { SparkLine } from "@/components/SparkLine";

const GREEN = "#0ECB81";
const RED = "#F6465D";

const COIN_COLORS: Record<string, string> = {
  BTC: "#f7931a", ETH: "#627eea", BNB: "#f3ba2f", XRP: "#346aa9",
  SOL: "#9945ff", ADA: "#3cc8c8", MATIC: "#8247e5", AVAX: "#e84142",
  DOT: "#e6007a", LINK: "#2a5ada", DOGE: "#c2a633",
};

function genSpark(price: number, change24h: number, symbol: string, n = 15): number[] {
  let seed = symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const start = price / (1 + change24h / 100);
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push(Math.max(start + start * (change24h / 100) * t + (rng() - 0.5) * start * 0.012, 1e-8));
  }
  pts[n - 1] = price;
  return pts;
}

type FTab = "positions" | "orders" | "history";

const LEVERAGE_OPTIONS = [5, 10, 20, 50, 100];

interface Position {
  id: number;
  symbol: string;
  side: string;
  size: number;
  entryPrice: number;
  leverage: number;
  liquidationPrice?: number;
  pnl?: number;
  pnlPct?: number;
}

export default function FuturesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { ticks } = usePrices();
  const [search, setSearch] = useState("");
  const [fTab, setFTab] = useState<FTab>("positions");

  const { data: posData } = useQuery({
    queryKey: ["futures-positions"],
    queryFn: () => apiFetch<{ positions: Position[] }>("/api/futures/position"),
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });

  const { data: orderData } = useQuery({
    queryKey: ["futures-orders"],
    queryFn: () => apiFetch<{ orders: any[] }>("/api/futures/order"),
    enabled: isAuthenticated && fTab === "orders",
  });

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const pairs = useMemo(() => {
    let list = ticks.filter((t) => t.usdt > 0 && t.symbol !== "USDT" && t.symbol !== "INR");
    list = list.sort((a, b) => (b.usdt * (b.volume24h ?? 0)) - (a.usdt * (a.volume24h ?? 0)));
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      list = list.filter((t) => t.symbol.includes(q));
    }
    return list;
  }, [ticks, search]);

  const positions = posData?.positions ?? [];
  const orders = orderData?.orders ?? [];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.topRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Futures</Text>
          <View style={styles.topIcons}>
            <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.muted }]}>
              <Feather name="info" size={16} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.muted }]}>
              <Feather name="settings" size={16} color={colors.foreground} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats bar */}
        <View style={[styles.statsBar, { backgroundColor: colors.muted, borderRadius: 10 }]}>
          <View style={styles.stat}>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Open Positions</Text>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{positions.length}</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Open Orders</Text>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{orders.length}</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Total PnL</Text>
            <Text style={[styles.statValue, { color: positions.reduce((s, p) => s + (p.pnl ?? 0), 0) >= 0 ? GREEN : RED }]}>
              {positions.reduce((s, p) => s + (p.pnl ?? 0), 0) >= 0 ? "+" : ""}
              ${positions.reduce((s, p) => s + (p.pnl ?? 0), 0).toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Search */}
        <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="search" size={15} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search futures pair..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>

      {/* ── Pairs List ── */}
      <View style={{ flex: 1 }}>
        {/* Column header */}
        <View style={[styles.colHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Text style={[styles.colLabel, { color: colors.mutedForeground, flex: 1 }]}>Contract</Text>
          <Text style={[styles.colLabel, { color: colors.mutedForeground, width: 60, textAlign: "center" }]}>Chart</Text>
          <Text style={[styles.colLabel, { color: colors.mutedForeground, width: 90, textAlign: "right" }]}>Mark Price</Text>
          <Text style={[styles.colLabel, { color: colors.mutedForeground, width: 65, textAlign: "right" }]}>24h Chg</Text>
        </View>

        <FlatList
          data={pairs.slice(0, 30)}
          keyExtractor={(t) => t.symbol}
          contentContainerStyle={{ paddingBottom: botPt + 230 }}
          removeClippedSubviews
          maxToRenderPerBatch={15}
          renderItem={({ item: t }) => {
            const coinColor = COIN_COLORS[t.symbol] ?? "#6b7a9e";
            const spark = genSpark(t.usdt, t.change24h, t.symbol);
            const priceStr = t.usdt < 1 ? t.usdt.toFixed(4) : t.usdt < 1000 ? t.usdt.toFixed(2) : t.usdt.toLocaleString("en-US", { maximumFractionDigits: 0 });
            const isPos = t.change24h >= 0;
            return (
              <TouchableOpacity
                style={[styles.pairRow, { borderBottomColor: colors.border }]}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/futures` as any);
                }}
                activeOpacity={0.7}
              >
                <View style={styles.pairLeft}>
                  <View style={[styles.coinCircle, { backgroundColor: coinColor + "22" }]}>
                    <Text style={[styles.coinLetter, { color: coinColor }]}>{t.symbol.charAt(0)}</Text>
                  </View>
                  <View>
                    <Text style={[styles.pairName, { color: colors.foreground }]}>
                      {t.symbol}<Text style={{ color: colors.mutedForeground, fontWeight: "400" }}>PERP</Text>
                    </Text>
                    <View style={[styles.leveragePill, { backgroundColor: GREEN + "22" }]}>
                      <Text style={[styles.leverageText, { color: GREEN }]}>Up to 100×</Text>
                    </View>
                  </View>
                </View>
                <SparkLine data={spark} width={60} height={30} positive={isPos} id={`f${t.symbol}`} />
                <View style={{ width: 90, alignItems: "flex-end" }}>
                  <Text style={[styles.pairPrice, { color: colors.foreground }]}>{priceStr}</Text>
                </View>
                <View style={[styles.changePill, { backgroundColor: (isPos ? GREEN : RED) + "22", width: 65 }]}>
                  <Text style={[styles.changePct, { color: isPos ? GREEN : RED }]}>
                    {isPos ? "+" : ""}{t.change24h.toFixed(2)}%
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* ── Positions Panel (bottom sticky) ── */}
      <View style={[styles.posPanel, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        {/* Tabs */}
        <View style={styles.posTabs}>
          {(["positions", "orders", "history"] as FTab[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.posTab, fTab === tab && { borderBottomColor: GREEN, borderBottomWidth: 2 }]}
              onPress={() => setFTab(tab)}
            >
              <Text style={[styles.posTabLabel, { color: fTab === tab ? GREEN : colors.mutedForeground }]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {tab === "positions" && positions.length > 0 ? ` (${positions.length})` : ""}
                {tab === "orders" && orders.length > 0 ? ` (${orders.length})` : ""}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        {!isAuthenticated ? (
          <TouchableOpacity style={styles.loginPrompt} onPress={() => router.push("/login")}>
            <Feather name="lock" size={16} color={colors.mutedForeground} />
            <Text style={[styles.loginText, { color: colors.mutedForeground }]}>Login to view positions</Text>
            <Text style={[styles.loginLink, { color: GREEN }]}>Log In →</Text>
          </TouchableOpacity>
        ) : fTab === "positions" && positions.length === 0 ? (
          <View style={styles.emptyPos}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No open positions</Text>
          </View>
        ) : fTab === "positions" ? (
          <ScrollView style={{ maxHeight: 120 }}>
            {positions.map((p) => (
              <View key={p.id} style={[styles.posRow, { borderBottomColor: colors.border }]}>
                <View style={styles.posLeft}>
                  <Text style={[styles.posSym, { color: colors.foreground }]}>{p.symbol} <Text style={{ color: p.side === "long" ? GREEN : RED }}>({p.side.toUpperCase()})</Text></Text>
                  <Text style={[styles.posSub, { color: colors.mutedForeground }]}>{p.leverage}× · Entry ${p.entryPrice?.toFixed(2)}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.posPnl, { color: (p.pnl ?? 0) >= 0 ? GREEN : RED }]}>
                    {(p.pnl ?? 0) >= 0 ? "+" : ""}${(p.pnl ?? 0).toFixed(2)}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>Size: {p.size}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.emptyPos}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {fTab === "orders" ? "No open orders" : "No history yet"}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { borderBottomWidth: StyleSheet.hairlineWidth },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: "800" },
  topIcons: { flexDirection: "row", gap: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  statsBar: { flexDirection: "row", marginHorizontal: 16, marginBottom: 10, padding: 12 },
  stat: { flex: 1, alignItems: "center" },
  statLabel: { fontSize: 10, fontWeight: "500", marginBottom: 4 },
  statValue: { fontSize: 15, fontWeight: "700" },
  statDivider: { width: 1, marginHorizontal: 8 },
  searchBar: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, height: 40, gap: 8, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 14 },
  colHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  colLabel: { fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  pairRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  pairLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  coinCircle: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  coinLetter: { fontSize: 13, fontWeight: "800" },
  pairName: { fontSize: 13, fontWeight: "700" },
  leveragePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: "flex-start", marginTop: 3 },
  leverageText: { fontSize: 9, fontWeight: "700" },
  pairPrice: { fontSize: 13, fontWeight: "600" },
  changePill: { paddingVertical: 5, borderRadius: 6, alignItems: "center" },
  changePct: { fontSize: 11, fontWeight: "700" },
  posPanel: { borderTopWidth: StyleSheet.hairlineWidth, paddingBottom: 16 },
  posTabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  posTab: { flex: 1, paddingVertical: 10, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  posTabLabel: { fontSize: 12, fontWeight: "700" },
  loginPrompt: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 20 },
  loginText: { fontSize: 13 },
  loginLink: { fontSize: 13, fontWeight: "700" },
  emptyPos: { paddingVertical: 20, alignItems: "center" },
  emptyText: { fontSize: 13 },
  posRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  posLeft: { flex: 1 },
  posSym: { fontSize: 13, fontWeight: "700" },
  posSub: { fontSize: 11, marginTop: 2 },
  posPnl: { fontSize: 14, fontWeight: "700" },
});
