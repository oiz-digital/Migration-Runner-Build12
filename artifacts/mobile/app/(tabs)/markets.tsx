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

import { useColors } from "@/hooks/useColors";
import { usePrices } from "@/hooks/usePrices";
import { useFavorites } from "@/hooks/useFavorites";
import { SparkLine } from "@/components/SparkLine";

const GREEN = "#0ECB81";
const RED = "#F6465D";

const COIN_COLORS: Record<string, string> = {
  BTC: "#f7931a", ETH: "#627eea", BNB: "#f3ba2f", XRP: "#346aa9",
  SOL: "#9945ff", ADA: "#3cc8c8", USDT: "#26a17b", MATIC: "#8247e5",
  AVAX: "#e84142", DOT: "#e6007a", LINK: "#2a5ada", DOGE: "#c2a633",
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

type MainTab = "spot" | "futures" | "gainers" | "losers" | "new";
type Quote = "all" | "USDT" | "BTC" | "ETH" | "BNB";

const MAIN_TABS: { key: MainTab; label: string }[] = [
  { key: "spot", label: "Spot" },
  { key: "futures", label: "Futures" },
  { key: "gainers", label: "Top Gainers" },
  { key: "losers", label: "Top Losers" },
  { key: "new", label: "New Listings" },
];

const QUOTES: Quote[] = ["all", "USDT", "BTC", "ETH", "BNB"];

export default function MarketsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { ticks } = usePrices();
  const { isFav, toggle } = useFavorites();
  const [mainTab, setMainTab] = useState<MainTab>("spot");
  const [quote, setQuote] = useState<Quote>("all");
  const [search, setSearch] = useState("");

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const filtered = useMemo(() => {
    let list = ticks.filter((t) => t.usdt > 0 && t.symbol !== "USDT" && t.symbol !== "INR");
    switch (mainTab) {
      case "gainers":
        list = [...list].filter((t) => t.change24h > 0).sort((a, b) => b.change24h - a.change24h);
        break;
      case "losers":
        list = [...list].filter((t) => t.change24h < 0).sort((a, b) => a.change24h - b.change24h);
        break;
      case "new":
        list = [...list].reverse().slice(0, 50);
        break;
      default:
        list = [...list].sort((a, b) => (b.usdt * (b.volume24h ?? 0)) - (a.usdt * (a.volume24h ?? 0)));
    }
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      list = list.filter((t) => t.symbol.toUpperCase().includes(q));
    }
    return list;
  }, [ticks, mainTab, search]);

  const renderItem = ({ item: t, index }: { item: typeof filtered[0]; index: number }) => {
    const coinColor = COIN_COLORS[t.symbol] ?? "#6b7a9e";
    const spark = genSpark(t.usdt, t.change24h, t.symbol);
    const priceStr = t.usdt < 0.001 ? t.usdt.toFixed(6) : t.usdt < 1 ? t.usdt.toFixed(4) : t.usdt < 1000 ? t.usdt.toFixed(2) : t.usdt.toLocaleString("en-US", { maximumFractionDigits: 0 });
    const volStr = (t.volume24h ?? 0) > 1e9 ? `${((t.volume24h ?? 0) / 1e9).toFixed(1)}B` : (t.volume24h ?? 0) > 1e6 ? `${((t.volume24h ?? 0) / 1e6).toFixed(1)}M` : `${((t.volume24h ?? 0) / 1e3).toFixed(0)}K`;
    const isPositive = t.change24h >= 0;

    return (
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => router.push(`/trade/${t.symbol}USDT` as any)}
        activeOpacity={0.7}
      >
        {/* Star */}
        <TouchableOpacity
          style={styles.starBtn}
          onPress={() => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            toggle(t.symbol);
          }}
        >
          <Feather name="star" size={14} color={isFav(t.symbol) ? "#F0B90B" : colors.border} />
        </TouchableOpacity>

        {/* Coin info */}
        <View style={styles.coinLeft}>
          <View style={[styles.coinCircle, { backgroundColor: coinColor + "22" }]}>
            <Text style={[styles.coinLetter, { color: coinColor }]}>{t.symbol.charAt(0)}</Text>
          </View>
          <View>
            <Text style={[styles.coinSym, { color: colors.foreground }]}>{t.symbol}<Text style={[styles.coinQuote, { color: colors.mutedForeground }]}>/USDT</Text></Text>
            <Text style={[styles.volText, { color: colors.mutedForeground }]}>Vol {volStr}</Text>
          </View>
        </View>

        {/* Sparkline */}
        <SparkLine data={spark} width={60} height={32} positive={isPositive} id={`m${t.symbol}`} />

        {/* Price */}
        <View style={styles.priceCol}>
          <Text style={[styles.priceText, { color: colors.foreground }]}>{priceStr}</Text>
          <Text style={[styles.priceUsdt, { color: colors.mutedForeground }]}>≈ ${priceStr}</Text>
        </View>

        {/* Change badge */}
        <View style={[styles.changePill, { backgroundColor: (isPositive ? GREEN : RED) + "22" }]}>
          <Text style={[styles.changePct, { color: isPositive ? GREEN : RED }]}>
            {isPositive ? "+" : ""}{t.change24h.toFixed(2)}%
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.topRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Markets</Text>
          <View style={styles.topIcons}>
            <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.muted }]}>
              <Feather name="search" size={16} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.muted }]}>
              <Feather name="sliders" size={16} color={colors.foreground} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search bar */}
        <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="search" size={15} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search coin..."
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

        {/* Main tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mainTabScroll} contentContainerStyle={{ gap: 0 }}>
          {MAIN_TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.mainTabBtn,
                mainTab === tab.key && { borderBottomColor: GREEN, borderBottomWidth: 2 },
              ]}
              onPress={() => setMainTab(tab.key)}
            >
              <Text style={[styles.mainTabLabel, { color: mainTab === tab.key ? GREEN : colors.mutedForeground }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Quote filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quoteScroll} contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingVertical: 8 }}>
          {QUOTES.map((q) => (
            <TouchableOpacity
              key={q}
              style={[
                styles.quoteBtn,
                { borderColor: colors.border },
                quote === q && { backgroundColor: GREEN + "22", borderColor: GREEN },
              ]}
              onPress={() => setQuote(q)}
            >
              <Text style={[styles.quoteLabel, { color: quote === q ? GREEN : colors.mutedForeground }]}>
                {q === "all" ? "All" : q}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Column headers ── */}
      <View style={[styles.colHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={{ width: 28 }} />
        <Text style={[styles.colLabel, { color: colors.mutedForeground, flex: 1 }]}>Pair/Vol</Text>
        <Text style={[styles.colLabel, { color: colors.mutedForeground, width: 70, textAlign: "center" }]}>7d Chart</Text>
        <Text style={[styles.colLabel, { color: colors.mutedForeground, width: 80, textAlign: "right" }]}>Last Price</Text>
        <Text style={[styles.colLabel, { color: colors.mutedForeground, width: 70, textAlign: "right" }]}>24h Chg%</Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(t) => t.symbol}
        contentContainerStyle={{ paddingBottom: botPt + 90, flexGrow: 1 }}
        removeClippedSubviews
        maxToRenderPerBatch={20}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={{ flex: 1, padding: 40, alignItems: "center" }}>
            <Feather name="bar-chart-2" size={36} color={colors.border} />
            <Text style={{ color: colors.mutedForeground, marginTop: 12, fontSize: 14 }}>
              {search ? "No coins found" : "Loading markets..."}
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
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  title: { fontSize: 22, fontWeight: "800" },
  topIcons: { flexDirection: "row", gap: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  searchBar: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, height: 40, gap: 8, marginBottom: 4 },
  searchInput: { flex: 1, fontSize: 14 },
  mainTabScroll: { borderBottomWidth: StyleSheet.hairlineWidth },
  mainTabBtn: { paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: "transparent" },
  mainTabLabel: { fontSize: 13, fontWeight: "700" },
  quoteScroll: {},
  quoteBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6, borderWidth: 1 },
  quoteLabel: { fontSize: 12, fontWeight: "600" },
  colHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  colLabel: { fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  starBtn: { width: 28, height: 36, alignItems: "center", justifyContent: "center" },
  coinLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  coinCircle: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  coinLetter: { fontSize: 13, fontWeight: "800" },
  coinSym: { fontSize: 13, fontWeight: "700" },
  coinQuote: { fontSize: 11 },
  volText: { fontSize: 10, marginTop: 2 },
  priceCol: { width: 80, alignItems: "flex-end" },
  priceText: { fontSize: 13, fontWeight: "600" },
  priceUsdt: { fontSize: 10, marginTop: 1 },
  changePill: { width: 70, paddingVertical: 5, borderRadius: 6, alignItems: "center" },
  changePct: { fontSize: 12, fontWeight: "700" },
});
