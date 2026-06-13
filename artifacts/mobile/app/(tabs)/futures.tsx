import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { usePrices } from "@/hooks/usePrices";
import { apiFetch, apiDelete } from "@/hooks/useApi";
import { SparkLine } from "@/components/SparkLine";

const GREEN = "#0ECB81";
const RED = "#F6465D";
const YELLOW = "#F0B90B";

const COIN_COLORS: Record<string, string> = {
  BTC: "#f7931a", ETH: "#627eea", BNB: "#f3ba2f", XRP: "#346aa9",
  SOL: "#9945ff", ADA: "#3cc8c8", MATIC: "#8247e5", AVAX: "#e84142",
  DOT: "#e6007a", LINK: "#2a5ada", DOGE: "#c2a633", DEFAULT: "#6b7a9e",
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

interface Position {
  id: number;
  symbol: string;
  side: string;
  size: number;
  entryPrice: number;
  markPrice?: number;
  leverage: number;
  liquidationPrice?: number;
  pnl?: number;
  pnlPct?: number;
  margin?: number;
}

interface FuturesOrder {
  id: number;
  symbol: string;
  side: string;
  type: string;
  amount: number;
  price?: number;
  status: string;
}

export default function FuturesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { ticks } = usePrices();
  const [search, setSearch] = useState("");
  const [fTab, setFTab] = useState<FTab>("positions");
  const [showPanel, setShowPanel] = useState(true);

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const { data: posData } = useQuery({
    queryKey: ["futures-positions"],
    queryFn: () => apiFetch<{ positions: Position[] }>("/api/futures/position"),
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });

  const { data: orderData } = useQuery({
    queryKey: ["futures-orders"],
    queryFn: () => apiFetch<{ orders: FuturesOrder[] }>("/api/futures/order"),
    enabled: isAuthenticated && fTab === "orders",
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/futures/order/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["futures-orders"] }),
  });

  const closeMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/futures/position/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["futures-positions"] }),
  });

  const pairs = useMemo(() => {
    let list = ticks.filter(t => t.usdt > 0 && t.symbol !== "USDT" && t.symbol !== "INR");
    list = list.sort((a, b) => (b.usdt * (b.volume24h ?? 0)) - (a.usdt * (a.volume24h ?? 0)));
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      list = list.filter(t => t.symbol.includes(q));
    }
    return list.slice(0, 40);
  }, [ticks, search]);

  const positions = posData?.positions ?? [];
  const orders = orderData?.orders ?? [];
  const totalPnl = positions.reduce((s, p) => s + (p.pnl ?? 0), 0);
  const totalMargin = positions.reduce((s, p) => s + (p.margin ?? p.size * p.entryPrice / p.leverage), 0);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={s.headerRow}>
          <Text style={[s.title, { color: colors.foreground }]}>Futures</Text>
          <View style={s.headerIcons}>
            <TouchableOpacity style={[s.iconBtn, { backgroundColor: colors.muted }]} onPress={() => router.push("/orders")}>
              <Feather name="clock" size={16} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity style={[s.iconBtn, { backgroundColor: colors.muted }]}>
              <Feather name="info" size={16} color={colors.foreground} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Account stats */}
        <LinearGradient colors={["#0D2E1E", "#1C2127"]} style={[s.statsBar, { borderColor: colors.border }]}>
          <View style={s.stat}>
            <Text style={[s.statLabel, { color: "#848E9C" }]}>Positions</Text>
            <Text style={[s.statValue, { color: colors.foreground }]}>{positions.length}</Text>
          </View>
          <View style={[s.statDiv, { backgroundColor: colors.border }]} />
          <View style={s.stat}>
            <Text style={[s.statLabel, { color: "#848E9C" }]}>Margin Used</Text>
            <Text style={[s.statValue, { color: colors.foreground }]}>${totalMargin.toFixed(2)}</Text>
          </View>
          <View style={[s.statDiv, { backgroundColor: colors.border }]} />
          <View style={s.stat}>
            <Text style={[s.statLabel, { color: "#848E9C" }]}>Total PnL</Text>
            <Text style={[s.statValue, { color: totalPnl >= 0 ? GREEN : RED }]}>
              {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
            </Text>
          </View>
          <View style={[s.statDiv, { backgroundColor: colors.border }]} />
          <View style={s.stat}>
            <Text style={[s.statLabel, { color: "#848E9C" }]}>Max Lev</Text>
            <Text style={[s.statValue, { color: GREEN }]}>100×</Text>
          </View>
        </LinearGradient>

        {/* Search */}
        <View style={[s.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="search" size={15} color="#848E9C" />
          <TextInput
            style={[s.searchInput, { color: colors.foreground }]}
            placeholder="Search futures pair..."
            placeholderTextColor="#848E9C"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.length > 0 && <TouchableOpacity onPress={() => setSearch("")}><Feather name="x" size={14} color="#848E9C" /></TouchableOpacity>}
        </View>
      </View>

      {/* Pairs list */}
      <View style={{ flex: 1 }}>
        <View style={[s.colHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Text style={[s.colLabel, { color: "#848E9C", flex: 1 }]}>Contract</Text>
          <Text style={[s.colLabel, { color: "#848E9C", width: 60, textAlign: "center" }]}>Chart</Text>
          <Text style={[s.colLabel, { color: "#848E9C", width: 90, textAlign: "right" }]}>Mark Price</Text>
          <Text style={[s.colLabel, { color: "#848E9C", width: 65, textAlign: "right" }]}>24h Chg</Text>
        </View>

        <FlatList
          data={pairs}
          keyExtractor={(t) => t.symbol}
          contentContainerStyle={{ paddingBottom: showPanel ? 220 : 70 }}
          removeClippedSubviews
          maxToRenderPerBatch={15}
          renderItem={({ item: t }) => {
            const c = COIN_COLORS[t.symbol] ?? COIN_COLORS.DEFAULT;
            const spark = genSpark(t.usdt, t.change24h, t.symbol);
            const p = t.usdt < 1 ? t.usdt.toFixed(4) : t.usdt < 1000 ? t.usdt.toFixed(2) : t.usdt.toLocaleString("en-US", { maximumFractionDigits: 0 });
            const isPos = t.change24h >= 0;
            return (
              <TouchableOpacity
                style={[s.pairRow, { borderBottomColor: colors.border }]}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/futures/${t.symbol}USDT` as any);
                }}
                activeOpacity={0.7}
              >
                <View style={s.pairLeft}>
                  <View style={[s.coinCircle, { backgroundColor: c + "22" }]}>
                    <Text style={[s.coinLetter, { color: c }]}>{t.symbol.charAt(0)}</Text>
                  </View>
                  <View>
                    <Text style={[s.pairName, { color: colors.foreground }]}>
                      {t.symbol}<Text style={{ color: "#848E9C", fontWeight: "400", fontSize: 11 }}>PERP</Text>
                    </Text>
                    <View style={[s.levPill, { backgroundColor: GREEN + "22" }]}>
                      <Text style={[s.levText, { color: GREEN }]}>Up to 100×</Text>
                    </View>
                  </View>
                </View>
                <SparkLine data={spark} width={60} height={30} positive={isPos} id={`f${t.symbol}`} />
                <View style={{ width: 90, alignItems: "flex-end" }}>
                  <Text style={[s.pairPrice, { color: colors.foreground }]}>{p}</Text>
                </View>
                <View style={[s.chgPill, { backgroundColor: (isPos ? GREEN : RED) + "22", width: 65 }]}>
                  <Text style={[s.chgText, { color: isPos ? GREEN : RED }]}>{isPos ? "+" : ""}{t.change24h.toFixed(2)}%</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Positions panel */}
      <View style={[s.posPanel, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        {/* Panel header */}
        <View style={s.panelHeader}>
          <View style={s.posTabs}>
            {(["positions", "orders", "history"] as FTab[]).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[s.posTab, fTab === tab && { borderBottomColor: GREEN, borderBottomWidth: 2 }]}
                onPress={() => setFTab(tab)}
              >
                <Text style={[s.posTabLabel, { color: fTab === tab ? GREEN : "#848E9C" }]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  {tab === "positions" && positions.length > 0 ? ` (${positions.length})` : ""}
                  {tab === "orders" && orders.length > 0 ? ` (${orders.length})` : ""}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={() => setShowPanel(p => !p)} style={s.toggleBtn}>
            <Feather name={showPanel ? "chevron-down" : "chevron-up"} size={16} color="#848E9C" />
          </TouchableOpacity>
        </View>

        {showPanel && (
          <>
            {!isAuthenticated ? (
              <TouchableOpacity style={s.loginPrompt} onPress={() => router.push("/login")}>
                <Feather name="lock" size={14} color="#848E9C" />
                <Text style={[s.loginText, { color: "#848E9C" }]}>Login to manage positions</Text>
                <Text style={[s.loginLink, { color: GREEN }]}>Log In →</Text>
              </TouchableOpacity>
            ) : fTab === "positions" ? (
              positions.length === 0 ? (
                <View style={s.emptyPanel}>
                  <Text style={[s.emptyText, { color: "#848E9C" }]}>No open positions</Text>
                  <TouchableOpacity onPress={() => router.push("/futures" as any)}>
                    <Text style={[s.emptyLink, { color: GREEN }]}>Open a position →</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 140 }}>
                  {positions.map((p) => (
                    <View key={p.id} style={[s.posRow, { borderBottomColor: colors.border }]}>
                      <View style={[s.posCircle, { backgroundColor: COIN_COLORS[p.symbol] ?? "#6b7a9e" + "22" }]}>
                        <Text style={[s.posCircleText, { color: COIN_COLORS[p.symbol] ?? "#6b7a9e" }]}>{p.symbol.charAt(0)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={[s.posSym, { color: colors.foreground }]}>{p.symbol}PERP</Text>
                          <View style={[s.sideBadge, { backgroundColor: (p.side === "long" ? GREEN : RED) + "22" }]}>
                            <Text style={[s.sideText, { color: p.side === "long" ? GREEN : RED }]}>{p.side.toUpperCase()}</Text>
                          </View>
                          <Text style={[s.posLev, { color: YELLOW }]}>{p.leverage}×</Text>
                        </View>
                        <Text style={[s.posSub, { color: "#848E9C" }]}>Entry ${p.entryPrice?.toFixed(2)}  ·  Size {p.size}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        <Text style={[s.posPnl, { color: (p.pnl ?? 0) >= 0 ? GREEN : RED }]}>
                          {(p.pnl ?? 0) >= 0 ? "+" : ""}${(p.pnl ?? 0).toFixed(2)}
                        </Text>
                        <TouchableOpacity
                          style={[s.closeBtn, { borderColor: RED + "60" }]}
                          onPress={() => Alert.alert("Close Position", `Close ${p.symbol} position?`, [
                            { text: "Cancel", style: "cancel" },
                            { text: "Close", style: "destructive", onPress: () => closeMutation.mutate(p.id) },
                          ])}
                        >
                          <Text style={[s.closeBtnText, { color: RED }]}>Close</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )
            ) : fTab === "orders" ? (
              orders.length === 0 ? (
                <View style={s.emptyPanel}><Text style={[s.emptyText, { color: "#848E9C" }]}>No open orders</Text></View>
              ) : (
                <ScrollView style={{ maxHeight: 140 }}>
                  {orders.map((o) => (
                    <View key={o.id} style={[s.posRow, { borderBottomColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.posSym, { color: colors.foreground }]}>{o.symbol} — {o.type}</Text>
                        <Text style={[s.posSub, { color: "#848E9C" }]}>{o.side.toUpperCase()} · Qty {o.amount} {o.price ? `@ $${o.price}` : "Market"}</Text>
                      </View>
                      <TouchableOpacity
                        style={[s.closeBtn, { borderColor: RED + "60" }]}
                        onPress={() => cancelMutation.mutate(o.id)}
                        disabled={cancelMutation.isPending}
                      >
                        <Text style={[s.closeBtnText, { color: RED }]}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )
            ) : (
              <View style={s.emptyPanel}><Text style={[s.emptyText, { color: "#848E9C" }]}>No trade history</Text></View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { borderBottomWidth: StyleSheet.hairlineWidth },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  title: { fontSize: 22, fontWeight: "800" },
  headerIcons: { flexDirection: "row", gap: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  statsBar: { flexDirection: "row", marginHorizontal: 16, marginBottom: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  stat: { flex: 1, alignItems: "center" },
  statLabel: { fontSize: 9, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4 },
  statValue: { fontSize: 13, fontWeight: "700" },
  statDiv: { width: 1, marginHorizontal: 4 },
  searchBar: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, height: 42, gap: 8, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 14 },
  colHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  colLabel: { fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  pairRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  pairLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  coinCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  coinLetter: { fontSize: 14, fontWeight: "800" },
  pairName: { fontSize: 13, fontWeight: "700" },
  levPill: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, alignSelf: "flex-start", marginTop: 2 },
  levText: { fontSize: 9, fontWeight: "700" },
  pairPrice: { fontSize: 13, fontWeight: "600" },
  chgPill: { paddingVertical: 5, borderRadius: 6, alignItems: "center" },
  chgText: { fontSize: 11, fontWeight: "700" },
  posPanel: { borderTopWidth: StyleSheet.hairlineWidth },
  panelHeader: { flexDirection: "row", alignItems: "center" },
  posTabs: { flex: 1, flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  posTab: { flex: 1, paddingVertical: 10, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  posTabLabel: { fontSize: 12, fontWeight: "700" },
  toggleBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  loginPrompt: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 18 },
  loginText: { fontSize: 13 },
  loginLink: { fontSize: 13, fontWeight: "700" },
  emptyPanel: { paddingVertical: 18, alignItems: "center", gap: 4 },
  emptyText: { fontSize: 13 },
  emptyLink: { fontSize: 13, fontWeight: "600" },
  posRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  posCircle: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  posCircleText: { fontSize: 12, fontWeight: "800" },
  posSym: { fontSize: 13, fontWeight: "700" },
  sideBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  sideText: { fontSize: 9, fontWeight: "800" },
  posLev: { fontSize: 11, fontWeight: "700" },
  posSub: { fontSize: 10, marginTop: 2 },
  posPnl: { fontSize: 13, fontWeight: "700" },
  closeBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  closeBtnText: { fontSize: 11, fontWeight: "700" },
});
