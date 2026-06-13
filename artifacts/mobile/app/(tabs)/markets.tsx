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

const COIN_COLORS: Record<string, string> = {
  BTC: "#f7931a", ETH: "#627eea", BNB: "#f3ba2f", XRP: "#346aa9",
  SOL: "#9945ff", ADA: "#3cc8c8", USDT: "#26a17b", MATIC: "#8247e5",
  AVAX: "#e84142", DOT: "#e6007a", LINK: "#2a5ada", DOGE: "#c2a633",
  DEFAULT: "#6b7a9e",
};

function genSpark(price: number, change24h: number, symbol: string, n = 20): number[] {
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

type MainTab = "watchlist" | "spot" | "futures" | "gainers" | "losers" | "new";

const MAIN_TABS: { key: MainTab; label: string; icon?: string }[] = [
  { key: "watchlist", label: "⭐ Watch" },
  { key: "spot", label: "Spot" },
  { key: "futures", label: "Futures" },
  { key: "gainers", label: "📈 Gainers" },
  { key: "losers", label: "📉 Losers" },
  { key: "new", label: "🆕 New" },
];

function GlobalStats({ ticks }: { ticks: any[] }) {
  const colors = useColors();
  const totalMcap = ticks.reduce((s, t) => s + (t.usdt > 0 ? t.usdt * (t.circSupply ?? 1e6) : 0), 0);
  const totalVol = ticks.reduce((s, t) => s + (t.volume24h ?? 0) * (t.usdt ?? 0), 0);
  const btc = ticks.find(t => t.symbol === "BTC");
  const btcChange = btc?.change24h ?? 0;
  const gainers = ticks.filter(t => t.change24h > 0).length;
  const total = ticks.filter(t => t.usdt > 0).length;
  const fgIndex = Math.min(100, Math.max(0, Math.round(50 + btcChange * 3)));
  const fgLabel = fgIndex > 70 ? "Extreme Greed" : fgIndex > 55 ? "Greed" : fgIndex > 45 ? "Neutral" : fgIndex > 30 ? "Fear" : "Extreme Fear";
  const fgColor = fgIndex > 60 ? GREEN : fgIndex > 45 ? YELLOW : RED;

  const fmt = (n: number) => n > 1e12 ? `$${(n / 1e12).toFixed(2)}T` : n > 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n > 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${n.toFixed(0)}`;

  const stats = [
    { label: "Market Cap", value: fmt(totalMcap || 2.1e12), color: colors.foreground },
    { label: "24h Volume", value: fmt(totalVol || 85e9), color: colors.foreground },
    { label: "Gainers", value: `${gainers}/${total}`, color: gainers > total / 2 ? GREEN : RED },
    { label: "Fear & Greed", value: `${fgIndex} ${fgLabel}`, color: fgColor },
  ];

  return (
    <LinearGradient
      colors={["#141C1E", "#0B0E11"]}
      style={[gs.statsWrap, { borderBottomColor: colors.border }]}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 10, paddingVertical: 10 }}>
        {stats.map((st) => (
          <View key={st.label} style={[gs.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[gs.statLabel, { color: "#848E9C" }]}>{st.label}</Text>
            <Text style={[gs.statValue, { color: st.color }]}>{st.value}</Text>
          </View>
        ))}
      </ScrollView>
    </LinearGradient>
  );
}
const gs = StyleSheet.create({
  statsWrap: { borderBottomWidth: StyleSheet.hairlineWidth },
  statCard: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, minWidth: 100 },
  statLabel: { fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 },
  statValue: { fontSize: 13, fontWeight: "700" },
});

export default function MarketsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { ticks } = usePrices();
  const { isFav, toggle } = useFavorites();
  const [mainTab, setMainTab] = useState<MainTab>("spot");
  const [search, setSearch] = useState("");

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const filtered = useMemo(() => {
    let list = ticks.filter(t => t.usdt > 0 && t.symbol !== "USDT" && t.symbol !== "INR");
    switch (mainTab) {
      case "watchlist":
        list = list.filter(t => isFav(t.symbol));
        break;
      case "gainers":
        list = [...list].filter(t => t.change24h > 0).sort((a, b) => b.change24h - a.change24h);
        break;
      case "losers":
        list = [...list].filter(t => t.change24h < 0).sort((a, b) => a.change24h - b.change24h);
        break;
      case "new":
        list = [...list].reverse().slice(0, 50);
        break;
      default:
        list = [...list].sort((a, b) => (b.usdt * (b.volume24h ?? 0)) - (a.usdt * (a.volume24h ?? 0)));
    }
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      list = list.filter(t => t.symbol.includes(q));
    }
    return list;
  }, [ticks, mainTab, search, isFav]);

  const renderItem = ({ item: t, index }: { item: typeof filtered[0]; index: number }) => {
    const c = COIN_COLORS[t.symbol] ?? COIN_COLORS.DEFAULT;
    const spark = genSpark(t.usdt, t.change24h, t.symbol);
    const p = t.usdt < 0.001 ? t.usdt.toFixed(6) : t.usdt < 1 ? t.usdt.toFixed(4) : t.usdt < 1000 ? t.usdt.toFixed(2) : t.usdt.toLocaleString("en-US", { maximumFractionDigits: 0 });
    const vol = (t.volume24h ?? 0) > 1e9 ? `${((t.volume24h ?? 0) / 1e9).toFixed(1)}B` : (t.volume24h ?? 0) > 1e6 ? `${((t.volume24h ?? 0) / 1e6).toFixed(1)}M` : `${((t.volume24h ?? 0) / 1e3).toFixed(0)}K`;
    const isPos = t.change24h >= 0;

    return (
      <TouchableOpacity
        style={[s.row, { borderBottomColor: colors.border }]}
        onPress={() => router.push(`/trade/${t.symbol}USDT` as any)}
        activeOpacity={0.75}
      >
        <TouchableOpacity
          style={s.starBtn}
          onPress={() => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            toggle(t.symbol);
          }}
        >
          <Feather name="star" size={14} color={isFav(t.symbol) ? YELLOW : colors.border} fill={isFav(t.symbol) ? YELLOW : "none"} />
        </TouchableOpacity>

        <View style={[s.coinCircle, { backgroundColor: c + "22" }]}>
          <Text style={[s.coinLetter, { color: c }]}>{t.symbol.charAt(0)}</Text>
        </View>

        <View style={s.coinInfo}>
          <Text style={[s.coinSym, { color: colors.foreground }]}>
            {t.symbol}<Text style={[s.coinQuote, { color: "#848E9C" }]}>/USDT</Text>
          </Text>
          <Text style={[s.coinVol, { color: "#848E9C" }]}>Vol {vol}</Text>
        </View>

        <SparkLine data={spark} width={62} height={32} positive={isPos} id={`mk${t.symbol}`} />

        <View style={s.priceCol}>
          <Text style={[s.priceText, { color: colors.foreground }]}>{p}</Text>
        </View>

        <View style={[s.chgPill, { backgroundColor: (isPos ? GREEN : RED) + "22" }]}>
          <Text style={[s.chgText, { color: isPos ? GREEN : RED }]}>
            {isPos ? "+" : ""}{t.change24h.toFixed(2)}%
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={s.headerRow}>
          <Text style={[s.title, { color: colors.foreground }]}>Markets</Text>
          <View style={s.headerIcons}>
            <TouchableOpacity style={[s.iconBtn, { backgroundColor: colors.muted }]}>
              <Feather name="sliders" size={16} color={colors.foreground} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search */}
        <View style={[s.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="search" size={15} color="#848E9C" />
          <TextInput
            style={[s.searchInput, { color: colors.foreground }]}
            placeholder="Search coin..."
            placeholderTextColor="#848E9C"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x-circle" size={15} color="#848E9C" />
            </TouchableOpacity>
          )}
        </View>

        {/* Main tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabScroll} contentContainerStyle={{ paddingHorizontal: 8 }}>
          {MAIN_TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[s.tabBtn, mainTab === tab.key && { borderBottomColor: GREEN, borderBottomWidth: 2 }]}
              onPress={() => setMainTab(tab.key)}
            >
              <Text style={[s.tabLabel, { color: mainTab === tab.key ? GREEN : "#848E9C" }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Global stats */}
      <GlobalStats ticks={ticks} />

      {/* Column header */}
      <View style={[s.colHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={{ width: 28 }} />
        <View style={{ width: 38 }} />
        <Text style={[s.colLabel, { color: "#848E9C", flex: 1 }]}>Pair / Vol</Text>
        <Text style={[s.colLabel, { color: "#848E9C", width: 62, textAlign: "center" }]}>Chart</Text>
        <Text style={[s.colLabel, { color: "#848E9C", width: 70, textAlign: "right" }]}>Price</Text>
        <Text style={[s.colLabel, { color: "#848E9C", width: 66, textAlign: "right" }]}>24h%</Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(t) => t.symbol}
        contentContainerStyle={{ paddingBottom: botPt + 90, flexGrow: 1 }}
        removeClippedSubviews
        maxToRenderPerBatch={20}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={s.empty}>
            <View style={[s.emptyIconWrap, { backgroundColor: colors.muted }]}>
              <Feather name={mainTab === "watchlist" ? "star" : "bar-chart-2"} size={32} color="#848E9C" />
            </View>
            <Text style={[s.emptyTitle, { color: colors.foreground }]}>
              {mainTab === "watchlist" ? "No Watchlist Yet" : search ? "No Results" : "Loading…"}
            </Text>
            <Text style={[s.emptySubtitle, { color: "#848E9C" }]}>
              {mainTab === "watchlist" ? "Tap ⭐ on any coin to add it to your watchlist" : search ? "Try a different search term" : "Connecting to live markets"}
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
  searchBar: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, height: 42, gap: 8, marginBottom: 4 },
  searchInput: { flex: 1, fontSize: 14 },
  tabScroll: { borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabLabel: { fontSize: 13, fontWeight: "700" },
  colHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  colLabel: { fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, gap: 0 },
  starBtn: { width: 28, alignItems: "center", justifyContent: "center" },
  coinCircle: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", marginRight: 10 },
  coinLetter: { fontSize: 15, fontWeight: "800" },
  coinInfo: { flex: 1 },
  coinSym: { fontSize: 13, fontWeight: "700" },
  coinQuote: { fontSize: 11, fontWeight: "400" },
  coinVol: { fontSize: 10, marginTop: 2 },
  priceCol: { width: 70, alignItems: "flex-end" },
  priceText: { fontSize: 13, fontWeight: "600" },
  chgPill: { width: 66, paddingVertical: 5, borderRadius: 6, alignItems: "center", marginLeft: 4 },
  chgText: { fontSize: 12, fontWeight: "700" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 48 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8, textAlign: "center" },
  emptySubtitle: { fontSize: 13, textAlign: "center", lineHeight: 20 },
});
