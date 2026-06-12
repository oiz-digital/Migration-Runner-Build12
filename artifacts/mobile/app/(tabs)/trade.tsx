import { Feather } from "@expo/vector-icons";
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
import { PriceChange } from "@/components/PriceChange";

const POPULAR = ["BTC", "ETH", "SOL", "BNB", "XRP", "MATIC", "AVAX", "ADA", "DOT", "LINK"];
const COIN_COLORS: Record<string, string> = {
  BTC: "#f7931a", ETH: "#627eea", BNB: "#f3ba2f", XRP: "#346aa9",
  SOL: "#9945ff", ADA: "#3cc8c8", MATIC: "#8247e5", AVAX: "#e84142",
  DOT: "#e6007a", LINK: "#2a5ada", DEFAULT: "#6b7a9e",
};

type Tab = "spot" | "futures";

export default function TradeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { ticks } = usePrices();
  const [tab, setTab] = useState<Tab>("spot");
  const [search, setSearch] = useState("");

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const pairs = useMemo(() => {
    const list = tab === "spot"
      ? ticks.filter((t) => t.usdt > 0 && t.symbol !== "USDT" && t.symbol !== "INR")
          .sort((a, b) => {
            const aIdx = POPULAR.indexOf(a.symbol);
            const bIdx = POPULAR.indexOf(b.symbol);
            if (aIdx === -1 && bIdx === -1) return (b.volume24h ?? 0) - (a.volume24h ?? 0);
            if (aIdx === -1) return 1;
            if (bIdx === -1) return -1;
            return aIdx - bIdx;
          })
      : ticks.filter((t) => t.usdt > 0 && t.symbol !== "USDT" && t.symbol !== "INR")
          .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      return list.filter((t) => t.symbol.toUpperCase().includes(q));
    }
    return list;
  }, [ticks, tab, search]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Trade</Text>
        <View style={styles.tabRow}>
          {(["spot", "futures"] as Tab[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[
                styles.tabBtn,
                { borderColor: colors.border },
                tab === t && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.tabLabel, { color: tab === t ? "#fff" : colors.mutedForeground }]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search pair..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>

      <FlatList
        data={pairs}
        keyExtractor={(t) => t.symbol}
        contentContainerStyle={{ paddingBottom: botPt + 80 }}
        renderItem={({ item: t }) => {
          const bg = COIN_COLORS[t.symbol] ?? COIN_COLORS.DEFAULT;
          const price = t.usdt;
          const priceStr = price < 0.001 ? price.toFixed(6) : price < 1 ? price.toFixed(4) : price.toLocaleString("en-US", { maximumFractionDigits: 2 });
          return (
            <TouchableOpacity
              style={[styles.pairRow, { borderBottomColor: colors.border }]}
              onPress={() => router.push(tab === "spot" ? `/trade/${t.symbol}USDT` as any : "/futures")}
              activeOpacity={0.7}
            >
              <View style={[styles.coinIcon, { backgroundColor: bg + "22" }]}>
                <Text style={[styles.coinLetter, { color: bg }]}>{t.symbol.charAt(0)}</Text>
              </View>
              <View style={styles.pairInfo}>
                <Text style={[styles.pairName, { color: colors.foreground }]}>{t.symbol}/USDT</Text>
                <Text style={[styles.pairVol, { color: colors.mutedForeground }]}>
                  Vol: {t.volume24h ? (t.volume24h > 1e6 ? `${(t.volume24h / 1e6).toFixed(1)}M` : `${(t.volume24h / 1e3).toFixed(0)}K`) : "—"}
                </Text>
              </View>
              <View style={styles.pairRight}>
                <Text style={[styles.pairPrice, { color: colors.foreground }]}>${priceStr}</Text>
                <PriceChange value={t.change24h} />
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  title: { fontSize: 22, fontWeight: "800", paddingTop: 12 },
  tabRow: { flexDirection: "row", gap: 8 },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  tabLabel: { fontSize: 14, fontWeight: "600" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },
  pairRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  coinIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginRight: 12 },
  coinLetter: { fontSize: 16, fontWeight: "700" },
  pairInfo: { flex: 1 },
  pairName: { fontSize: 15, fontWeight: "600" },
  pairVol: { fontSize: 12, marginTop: 2 },
  pairRight: { alignItems: "flex-end", gap: 4 },
  pairPrice: { fontSize: 15, fontWeight: "600" },
});
