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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { usePrices } from "@/hooks/usePrices";
import { useFavorites } from "@/hooks/useFavorites";
import { CoinRowWithSpark } from "@/components/CoinRowWithSpark";
import { EmptyState } from "@/components/EmptyState";

type Cat = "favs" | "hot" | "gainers" | "losers" | "new";
type Sort = "vol" | "change" | "price";

function genSparkData(price: number, change24h: number, symbol: string, n = 20): number[] {
  let seed = symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const start = price / (1 + change24h / 100);
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const trend = start * (change24h / 100) * t;
    const noise = (rng() - 0.5) * start * 0.012;
    pts.push(Math.max(start + trend + noise, 1e-8));
  }
  pts[n - 1] = price;
  return pts;
}

const CATS: { key: Cat; label: string; icon: string }[] = [
  { key: "favs", label: "Favs", icon: "⭐" },
  { key: "hot", label: "Hot", icon: "🔥" },
  { key: "gainers", label: "Gainers", icon: "🚀" },
  { key: "losers", label: "Losers", icon: "📉" },
  { key: "new", label: "New", icon: "✨" },
];

export default function MarketsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { ticks } = usePrices();
  const { favorites, toggle, isFav } = useFavorites();
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<Cat>("hot");
  const [sort, setSort] = useState<Sort>("vol");
  const [showSort, setShowSort] = useState(false);

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const filtered = useMemo(() => {
    let list = ticks.filter((t) => t.usdt > 0 && t.symbol !== "USDT" && t.symbol !== "INR");

    switch (cat) {
      case "favs":
        list = list.filter((t) => favorites.has(t.symbol));
        break;
      case "hot":
        list = list.sort((a, b) => (b.volume24h ?? 0) * b.usdt - (a.volume24h ?? 0) * a.usdt);
        break;
      case "gainers":
        list = list.filter((t) => t.change24h > 0).sort((a, b) => b.change24h - a.change24h);
        break;
      case "losers":
        list = list.filter((t) => t.change24h < 0).sort((a, b) => a.change24h - b.change24h);
        break;
      case "new":
        list = [...list].reverse().slice(0, 50);
        break;
    }

    if (cat !== "favs") {
      if (sort === "vol") list = [...list].sort((a, b) => (b.volume24h ?? 0) * b.usdt - (a.volume24h ?? 0) * a.usdt);
      else if (sort === "change") list = [...list].sort((a, b) => b.change24h - a.change24h);
      else if (sort === "price") list = [...list].sort((a, b) => b.usdt - a.usdt);
    }

    if (search.trim()) {
      const q = search.trim().toUpperCase();
      list = list.filter((t) => t.symbol.toUpperCase().includes(q));
    }
    return list;
  }, [ticks, cat, sort, search, favorites]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Markets</Text>
          <TouchableOpacity
            style={[styles.sortBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
            onPress={() => setShowSort((s) => !s)}
          >
            <Feather name="sliders" size={14} color={colors.mutedForeground} />
            <Text style={[styles.sortLabel, { color: colors.mutedForeground }]}>
              {sort === "vol" ? "Volume" : sort === "change" ? "Change" : "Price"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="search" size={15} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search coins..."
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

        {/* Sort dropdown */}
        {showSort && (
          <View style={[styles.sortMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {(["vol", "change", "price"] as Sort[]).map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.sortItem, s === sort && { backgroundColor: colors.primary + "20" }]}
                onPress={() => { setSort(s); setShowSort(false); }}
              >
                <Text style={[styles.sortItemLabel, { color: s === sort ? colors.primary : colors.foreground }]}>
                  Sort by {s === "vol" ? "Volume" : s === "change" ? "24h Change" : "Price"}
                </Text>
                {s === sort && <Feather name="check" size={14} color={colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Category tabs */}
        <View style={styles.catRow}>
          {CATS.map((c) => (
            <TouchableOpacity
              key={c.key}
              style={[
                styles.catBtn,
                { borderColor: "transparent" },
                cat === c.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
              ]}
              onPress={() => setCat(c.key)}
            >
              <Text style={[styles.catLabel, { color: cat === c.key ? colors.primary : colors.mutedForeground }]}>
                {c.icon} {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Column headers */}
      <View style={[styles.colHeader, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
        <TouchableOpacity style={{ width: 28, alignItems: "center" }}>
          <Feather name="star" size={12} color={colors.mutedForeground} />
        </TouchableOpacity>
        <Text style={[styles.colLabel, { color: colors.mutedForeground, flex: 1 }]}>#  Name</Text>
        <Text style={[styles.colLabel, { color: colors.mutedForeground, width: 62 }]}>7d Chart</Text>
        <Text style={[styles.colLabel, { color: colors.mutedForeground, width: 80, textAlign: "right" }]}>Price</Text>
        <Text style={[styles.colLabel, { color: colors.mutedForeground, width: 60, textAlign: "right" }]}>24h %</Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(t) => t.symbol}
        contentContainerStyle={{ paddingBottom: botPt + 80, flexGrow: 1 }}
        removeClippedSubviews
        maxToRenderPerBatch={20}
        renderItem={({ item: t, index }) => (
          <View style={styles.rowWrap}>
            <TouchableOpacity
              style={styles.starBtn}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                toggle(t.symbol);
              }}
            >
              <Feather
                name={isFav(t.symbol) ? "star" : "star"}
                size={14}
                color={isFav(t.symbol) ? "#f59e0b" : colors.border}
              />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <CoinRowWithSpark
                symbol={t.symbol}
                price={t.usdt}
                change24h={t.change24h}
                volume={t.volume24h * t.usdt}
                sparkData={genSparkData(t.usdt, t.change24h, t.symbol)}
                rank={index + 1}
                onPress={() => router.push(`/trade/${t.symbol}USDT` as any)}
              />
            </View>
          </View>
        )}
        ListEmptyComponent={
          cat === "favs" ? (
            <EmptyState
              icon="star"
              title="No favorites yet"
              subtitle="Tap the ★ star next to any coin to add it here"
            />
          ) : (
            <EmptyState
              icon="bar-chart-2"
              title={search ? "No coins found" : "Loading markets..."}
              subtitle={search ? "Try a different symbol" : "Connecting to live data"}
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 14, paddingBottom: 10 },
  title: { fontSize: 22, fontWeight: "800" },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  sortLabel: { fontSize: 12, fontWeight: "600" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 14 },
  sortMenu: {
    position: "absolute",
    top: 58,
    right: 16,
    width: 200,
    borderRadius: 10,
    borderWidth: 1,
    zIndex: 100,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  sortItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12 },
  sortItemLabel: { fontSize: 14 },
  catRow: { flexDirection: "row" },
  catBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  catLabel: { fontSize: 12, fontWeight: "700" },
  colHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 8,
    paddingRight: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  colLabel: { fontSize: 10, fontWeight: "600", textTransform: "uppercase" },
  rowWrap: { flexDirection: "row", alignItems: "center", paddingLeft: 8 },
  starBtn: { width: 28, height: 44, alignItems: "center", justifyContent: "center" },
});
