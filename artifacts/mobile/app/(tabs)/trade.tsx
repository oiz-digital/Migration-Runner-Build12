import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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

import { useColors } from "@/hooks/useColors";
import { usePrices } from "@/hooks/usePrices";
import { useFavorites } from "@/hooks/useFavorites";
import { SparkLine } from "@/components/SparkLine";

const GREEN = "#0ECB81";
const RED = "#F6465D";
const YELLOW = "#F0B90B";
const PURPLE = "#9945ff";

const COIN_COLORS: Record<string, string> = {
  BTC: "#f7931a", ETH: "#627eea", BNB: "#f3ba2f", XRP: "#346aa9",
  SOL: "#9945ff", ADA: "#3cc8c8", MATIC: "#8247e5", AVAX: "#e84142",
  DOT: "#e6007a", LINK: "#2a5ada", DOGE: "#c2a633", DEFAULT: "#6b7a9e",
};

const POPULAR = ["BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "AVAX", "MATIC", "DOT", "LINK", "DOGE"];

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

  const hotPairs = useMemo(() => {
    return ticks
      .filter(t => t.usdt > 0 && POPULAR.includes(t.symbol))
      .sort((a, b) => POPULAR.indexOf(a.symbol) - POPULAR.indexOf(b.symbol))
      .slice(0, 7);
  }, [ticks]);

  const allPairs = useMemo(() => {
    let list = ticks.filter(t => t.usdt > 0 && t.symbol !== "USDT" && t.symbol !== "INR");
    list = list.sort((a, b) => {
      const ai = POPULAR.indexOf(a.symbol), bi = POPULAR.indexOf(b.symbol);
      if (ai === -1 && bi === -1) return (b.usdt * (b.volume24h ?? 0)) - (a.usdt * (a.volume24h ?? 0));
      if (ai === -1) return 1; if (bi === -1) return -1;
      return ai - bi;
    });
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      list = list.filter(t => t.symbol.includes(q));
    }
    return list;
  }, [ticks, search]);

  const handlePress = (symbol: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (mode === "futures") router.push("/futures" as any);
    else if (mode === "p2p") router.push("/p2p" as any);
    else router.push(`/trade/${symbol}USDT` as any);
  };

  const MODES = [
    { key: "spot" as Mode, label: "Spot", color: GREEN },
    { key: "margin" as Mode, label: "Margin", color: YELLOW },
    { key: "futures" as Mode, label: "Futures", color: RED },
    { key: "p2p" as Mode, label: "P2P", color: PURPLE },
  ];

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={s.headerRow}>
          <Text style={[s.title, { color: colors.foreground }]}>Trade</Text>
          <View style={s.headerIcons}>
            <TouchableOpacity style={[s.iconBtn, { backgroundColor: colors.muted }]} onPress={() => router.push("/orders")}>
              <Feather name="clock" size={16} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity style={[s.iconBtn, { backgroundColor: colors.muted }]} onPress={() => router.push("/settings" as any)}>
              <Feather name="settings" size={16} color={colors.foreground} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Mode tabs */}
        <View style={[s.modeRow, { backgroundColor: colors.muted }]}>
          {MODES.map((m) => (
            <TouchableOpacity
              key={m.key}
              style={[s.modeBtn, mode === m.key && { backgroundColor: colors.card }]}
              onPress={() => setMode(m.key)}
            >
              <Text style={[s.modeLabel, { color: mode === m.key ? m.color : "#848E9C" }]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Search */}
        <View style={[s.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="search" size={15} color="#848E9C" />
          <TextInput
            style={[s.searchInput, { color: colors.foreground }]}
            placeholder="Search pair..."
            placeholderTextColor="#848E9C"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x" size={14} color="#848E9C" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={allPairs}
        keyExtractor={(t) => t.symbol}
        contentContainerStyle={{ paddingBottom: botPt + 90 }}
        removeClippedSubviews
        maxToRenderPerBatch={20}
        ListHeaderComponent={
          <>
            {/* Hot Pairs horizontal scroll */}
            {!search && (
              <View style={s.hotSection}>
                <Text style={[s.hotTitle, { color: colors.foreground }]}>🔥 Hot Pairs</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingTop: 10 }}>
                  {hotPairs.map((t) => {
                    const c = COIN_COLORS[t.symbol] ?? COIN_COLORS.DEFAULT;
                    const isPos = t.change24h >= 0;
                    const p = t.usdt < 1 ? t.usdt.toFixed(4) : t.usdt < 1000 ? t.usdt.toFixed(2) : t.usdt.toLocaleString("en-US", { maximumFractionDigits: 0 });
                    const spark = genSpark(t.usdt, t.change24h, t.symbol);
                    return (
                      <TouchableOpacity
                        key={t.symbol}
                        style={[s.hotCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                        onPress={() => handlePress(t.symbol)}
                        activeOpacity={0.8}
                      >
                        <LinearGradient colors={[c + "18", "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
                        <View style={s.hotCardTop}>
                          <View style={[s.hotCircle, { backgroundColor: c + "25" }]}>
                            <Text style={[s.hotLetter, { color: c }]}>{t.symbol.charAt(0)}</Text>
                          </View>
                          <View style={[s.hotChgBadge, { backgroundColor: (isPos ? GREEN : RED) + "22" }]}>
                            <Text style={[s.hotChgText, { color: isPos ? GREEN : RED }]}>
                              {isPos ? "+" : ""}{t.change24h.toFixed(1)}%
                            </Text>
                          </View>
                        </View>
                        <Text style={[s.hotSym, { color: colors.foreground }]}>{t.symbol}</Text>
                        <Text style={[s.hotPairQuote, { color: "#848E9C" }]}>/USDT</Text>
                        <Text style={[s.hotPrice, { color: colors.foreground }]}>${p}</Text>
                        <SparkLine data={spark} width={104} height={36} positive={isPos} id={`ht${t.symbol}`} />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Column headers */}
            <View style={[s.colHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
              <View style={{ width: 28 }} />
              <Text style={[s.colLabel, { color: "#848E9C", flex: 1 }]}>Name / Volume</Text>
              <Text style={[s.colLabel, { color: "#848E9C", width: 60, textAlign: "center" }]}>Chart</Text>
              <Text style={[s.colLabel, { color: "#848E9C", width: 86, textAlign: "right" }]}>Last Price</Text>
              <Text style={[s.colLabel, { color: "#848E9C", width: 68, textAlign: "right" }]}>24h Chg</Text>
            </View>
          </>
        }
        renderItem={({ item: t }) => {
          const c = COIN_COLORS[t.symbol] ?? COIN_COLORS.DEFAULT;
          const spark = genSpark(t.usdt, t.change24h, t.symbol);
          const p = t.usdt < 0.001 ? t.usdt.toFixed(6) : t.usdt < 1 ? t.usdt.toFixed(4) : t.usdt < 1000 ? t.usdt.toFixed(2) : t.usdt.toLocaleString("en-US", { maximumFractionDigits: 0 });
          const vol = (t.volume24h ?? 0) > 1e6 ? `${((t.volume24h ?? 0) / 1e6).toFixed(1)}M` : `${((t.volume24h ?? 0) / 1e3).toFixed(0)}K`;
          const isPos = t.change24h >= 0;
          return (
            <TouchableOpacity
              style={[s.pairRow, { borderBottomColor: colors.border }]}
              onPress={() => handlePress(t.symbol)}
              activeOpacity={0.7}
            >
              <TouchableOpacity style={s.starBtn} onPress={() => { if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggle(t.symbol); }}>
                <Feather name="star" size={13} color={isFav(t.symbol) ? YELLOW : colors.border} />
              </TouchableOpacity>
              <View style={[s.coinCircle, { backgroundColor: c + "22" }]}>
                <Text style={[s.coinLetter, { color: c }]}>{t.symbol.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.pairName, { color: colors.foreground }]}>{t.symbol}<Text style={{ color: "#848E9C", fontWeight: "400" }}>/USDT</Text></Text>
                <Text style={[s.pairVol, { color: "#848E9C" }]}>{vol}</Text>
              </View>
              <SparkLine data={spark} width={60} height={30} positive={isPos} id={`tr${t.symbol}`} />
              <View style={{ width: 86, alignItems: "flex-end" }}>
                <Text style={[s.pairPrice, { color: colors.foreground }]}>{p}</Text>
              </View>
              <View style={[s.chgPill, { backgroundColor: (isPos ? GREEN : RED) + "22", width: 68 }]}>
                <Text style={[s.chgText, { color: isPos ? GREEN : RED }]}>{isPos ? "+" : ""}{t.change24h.toFixed(2)}%</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Feather name="repeat" size={36} color="#848E9C" />
            <Text style={{ color: "#848E9C", marginTop: 12, fontSize: 14 }}>
              {search ? "No pairs found" : "Loading trading pairs…"}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { borderBottomWidth: StyleSheet.hairlineWidth },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: "800" },
  headerIcons: { flexDirection: "row", gap: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  modeRow: { flexDirection: "row", marginHorizontal: 16, borderRadius: 10, padding: 3, marginBottom: 10, gap: 2 },
  modeBtn: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 8 },
  modeLabel: { fontSize: 12, fontWeight: "700" },
  searchBar: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, height: 42, gap: 8, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 14 },
  hotSection: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  hotTitle: { fontSize: 15, fontWeight: "800", marginBottom: 2 },
  hotCard: { width: 120, borderRadius: 14, borderWidth: 1, padding: 12, gap: 2, overflow: "hidden" },
  hotCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  hotCircle: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  hotLetter: { fontSize: 14, fontWeight: "800" },
  hotChgBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 },
  hotChgText: { fontSize: 9, fontWeight: "700" },
  hotSym: { fontSize: 14, fontWeight: "700" },
  hotPairQuote: { fontSize: 10, marginBottom: 2 },
  hotPrice: { fontSize: 12, fontWeight: "600", marginBottom: 6 },
  colHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  colLabel: { fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  pairRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  starBtn: { width: 28, height: 36, alignItems: "center", justifyContent: "center" },
  coinCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginRight: 8 },
  coinLetter: { fontSize: 14, fontWeight: "800" },
  pairName: { fontSize: 13, fontWeight: "700" },
  pairVol: { fontSize: 10, marginTop: 2 },
  pairPrice: { fontSize: 13, fontWeight: "600" },
  chgPill: { paddingVertical: 5, borderRadius: 6, alignItems: "center" },
  chgText: { fontSize: 12, fontWeight: "700" },
  emptyWrap: { flex: 1, padding: 40, alignItems: "center" },
});
