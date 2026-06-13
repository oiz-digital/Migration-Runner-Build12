import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { usePrices } from "@/hooks/usePrices";
import { useFavorites } from "@/hooks/useFavorites";
import { SparkLine } from "@/components/SparkLine";

const GREEN = "#0ECB81";
const RED = "#F6465D";

const COIN_COLORS: Record<string, string> = {
  BTC: "#f7931a", ETH: "#627eea", BNB: "#f3ba2f", XRP: "#346aa9",
  SOL: "#9945ff", ADA: "#3cc8c8", MATIC: "#8247e5", AVAX: "#e84142",
  DOT: "#e6007a", LINK: "#2a5ada", DOGE: "#c2a633",
};

const POPULAR = ["BTC", "ETH", "SOL", "BNB", "XRP", "MATIC", "AVAX", "ADA", "DOT", "LINK", "DOGE"];

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

type Mode = "spot" | "margin" | "futures" | "p2p";

const MODES: { key: Mode; label: string }[] = [
  { key: "spot", label: "Spot" },
  { key: "margin", label: "Margin" },
  { key: "futures", label: "Futures" },
  { key: "p2p", label: "P2P" },
];

export default function TradeTabScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { ticks } = usePrices();
  const { isFav, toggle } = useFavorites();
  const [mode, setMode] = useState<Mode>("spot");
  const [search, setSearch] = useState("");

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const pairs = useMemo(() => {
    let list = ticks.filter((t) => t.usdt > 0 && t.symbol !== "USDT" && t.symbol !== "INR");
    list = list.sort((a, b) => {
      const ai = POPULAR.indexOf(a.symbol);
      const bi = POPULAR.indexOf(b.symbol);
      if (ai === -1 && bi === -1) return (b.usdt * (b.volume24h ?? 0)) - (a.usdt * (a.volume24h ?? 0));
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      list = list.filter((t) => t.symbol.includes(q));
    }
    return list;
  }, [ticks, mode, search]);

  const handlePress = (symbol: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (mode === "futures") {
      router.push("/futures" as any);
    } else if (mode === "p2p") {
      router.push("/p2p" as any);
    } else {
      router.push(`/trade/${symbol}USDT` as any);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.topRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Trade</Text>
          <View style={styles.topIcons}>
            <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.muted }]}>
              <Feather name="clock" size={16} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.muted }]}>
              <Feather name="settings" size={16} color={colors.foreground} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Mode tabs */}
        <View style={[styles.modeRow, { backgroundColor: colors.muted, borderRadius: 8 }]}>
          {MODES.map((m) => (
            <TouchableOpacity
              key={m.key}
              style={[
                styles.modeBtn,
                mode === m.key && { backgroundColor: colors.card, borderRadius: 6 },
              ]}
              onPress={() => setMode(m.key)}
            >
              <Text style={[styles.modeLabel, { color: mode === m.key ? GREEN : colors.mutedForeground }]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Search */}
        <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="search" size={15} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search trading pair..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>

        {/* Column headers */}
        <View style={[styles.colHeader, { borderTopColor: colors.border }]}>
          <Text style={[styles.colLabel, { color: colors.mutedForeground, flex: 1 }]}>Name</Text>
          <Text style={[styles.colLabel, { color: colors.mutedForeground, width: 60, textAlign: "center" }]}>Chart</Text>
          <Text style={[styles.colLabel, { color: colors.mutedForeground, width: 90, textAlign: "right" }]}>Last Price</Text>
          <Text style={[styles.colLabel, { color: colors.mutedForeground, width: 70, textAlign: "right" }]}>24h Chg%</Text>
        </View>
      </View>

      <FlatList
        data={pairs}
        keyExtractor={(t) => t.symbol}
        contentContainerStyle={{ paddingBottom: botPt + 90 }}
        removeClippedSubviews
        maxToRenderPerBatch={20}
        renderItem={({ item: t }) => {
          const coinColor = COIN_COLORS[t.symbol] ?? "#6b7a9e";
          const spark = genSpark(t.usdt, t.change24h, t.symbol);
          const priceStr = t.usdt < 0.001 ? t.usdt.toFixed(6) : t.usdt < 1 ? t.usdt.toFixed(4) : t.usdt < 1000 ? t.usdt.toFixed(2) : t.usdt.toLocaleString("en-US", { maximumFractionDigits: 0 });
          const isPos = t.change24h >= 0;

          return (
            <TouchableOpacity
              style={[styles.pairRow, { borderBottomColor: colors.border }]}
              onPress={() => handlePress(t.symbol)}
              activeOpacity={0.7}
            >
              <View style={styles.pairLeft}>
                <TouchableOpacity
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    toggle(t.symbol);
                  }}
                  style={{ marginRight: 8 }}
                >
                  <Feather name="star" size={13} color={isFav(t.symbol) ? "#F0B90B" : colors.border} />
                </TouchableOpacity>
                <View style={[styles.coinCircle, { backgroundColor: coinColor + "22" }]}>
                  <Text style={[styles.coinLetter, { color: coinColor }]}>{t.symbol.charAt(0)}</Text>
                </View>
                <View>
                  <Text style={[styles.pairName, { color: colors.foreground }]}>
                    {t.symbol}<Text style={{ color: colors.mutedForeground, fontWeight: "400" }}>/USDT</Text>
                  </Text>
                  <Text style={[styles.pairVol, { color: colors.mutedForeground }]}>
                    {(t.volume24h ?? 0) > 1e6 ? `${((t.volume24h ?? 0) / 1e6).toFixed(1)}M` : `${((t.volume24h ?? 0) / 1e3).toFixed(0)}K`} USDT
                  </Text>
                </View>
              </View>

              <SparkLine data={spark} width={60} height={30} positive={isPos} id={`tr${t.symbol}`} />

              <View style={{ width: 90, alignItems: "flex-end" }}>
                <Text style={[styles.pairPrice, { color: colors.foreground }]}>{priceStr}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>≈ ${priceStr}</Text>
              </View>

              <View style={[styles.changePill, { backgroundColor: (isPos ? GREEN : RED) + "22", width: 70 }]}>
                <Text style={[styles.changePct, { color: isPos ? GREEN : RED }]}>
                  {isPos ? "+" : ""}{t.change24h.toFixed(2)}%
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={{ flex: 1, padding: 40, alignItems: "center" }}>
            <Feather name="repeat" size={36} color={colors.border} />
            <Text style={{ color: colors.mutedForeground, marginTop: 12, fontSize: 14 }}>
              {search ? "No pairs found" : "Loading trading pairs..."}
            </Text>
          </View>
        }
      />
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
  modeRow: { flexDirection: "row", marginHorizontal: 16, padding: 3, marginBottom: 10, gap: 2 },
  modeBtn: { flex: 1, paddingVertical: 7, alignItems: "center" },
  modeLabel: { fontSize: 12, fontWeight: "700" },
  searchBar: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, height: 40, gap: 8, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 14 },
  colHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  colLabel: { fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  pairRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  pairLeft: { flex: 1, flexDirection: "row", alignItems: "center" },
  coinCircle: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", marginRight: 8 },
  coinLetter: { fontSize: 14, fontWeight: "800" },
  pairName: { fontSize: 13, fontWeight: "700" },
  pairVol: { fontSize: 10, marginTop: 2 },
  pairPrice: { fontSize: 13, fontWeight: "600" },
  changePill: { paddingVertical: 5, borderRadius: 6, alignItems: "center" },
  changePct: { fontSize: 12, fontWeight: "700" },
});
