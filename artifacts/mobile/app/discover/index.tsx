import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/hooks/useApi";
import { EmptyState } from "@/components/EmptyState";

interface DiscoverToken {
  id: number;
  symbol: string;
  name: string;
  chain: string;
  priceUsd: string;
  volume24hUsd: string;
  marketCapUsd: string;
  priceChange24h: string;
  riskScore: number;
  status: string;
  discoveredAt: string;
}

const CHAINS = ["All", "ethereum", "bsc", "polygon", "solana", "avalanche"];
const SORTS = ["volume", "new", "gainers", "losers"];

const CHAIN_COLORS: Record<string, string> = {
  ethereum: "#627eea",
  bsc: "#f3ba2f",
  polygon: "#8247e5",
  solana: "#9945ff",
  avalanche: "#e84142",
  All: "#6b7a9e",
};

function fmtCompact(v: string | number) {
  const n = parseFloat(String(v));
  if (!isFinite(n) || n === 0) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${parseFloat(n.toFixed(6))}`;
}

function fmtPrice(v: string | number) {
  const n = parseFloat(String(v));
  if (!isFinite(n) || n === 0) return "—";
  if (n < 0.0001) return `$${n.toExponential(2)}`;
  if (n < 1) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(2)}`;
}

function riskColor(score: number) {
  if (score < 30) return "#0ECB81";
  if (score < 60) return "#f59e0b";
  return "#F6465D";
}

function riskLabel(score: number) {
  if (score < 30) return "Low";
  if (score < 60) return "Medium";
  return "High";
}

export default function DiscoverScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const [chain, setChain] = useState("All");
  const [sort, setSort] = useState("volume");
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch } = useQuery<{ tokens: DiscoverToken[]; stats: any }>({
    queryKey: ["discover", chain, sort],
    queryFn: () => {
      const params = new URLSearchParams();
      if (chain !== "All") params.set("chain", chain);
      params.set("sort", sort);
      params.set("limit", "50");
      return apiFetch(`/api/discover/token?${params}`);
    },
    refetchInterval: 60_000,
  });

  const tokens = (data?.tokens ?? []).filter((t) =>
    !search || t.symbol.toUpperCase().includes(search.toUpperCase()) ||
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const stats = data?.stats;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={["#0d1524", "#080e1a"]} style={[styles.header, { paddingTop: topPt + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Discover</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => refetch()}>
          <Feather name="refresh-cw" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </LinearGradient>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        {[
          { label: "Tracked", value: stats?.totalTokens ?? "—", icon: "globe" as const, color: colors.primary },
          { label: "New 24h", value: stats?.new24h ?? "—", icon: "zap" as const, color: "#0ECB81" },
          { label: "24h Vol", value: fmtCompact(stats?.vol24h ?? 0), icon: "trending-up" as const, color: "#f59e0b" },
        ].map((s) => (
          <View key={s.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name={s.icon} size={14} color={s.color} />
            <Text style={[styles.statVal, { color: colors.foreground }]}>{s.value}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={15} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Search tokens..."
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Feather name="x" size={15} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {/* Chain filters */}
      <FlatList
        data={CHAINS}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(c) => c}
        style={styles.filterList}
        contentContainerStyle={{ paddingHorizontal: 14, gap: 8 }}
        renderItem={({ item: c }) => {
          const col = CHAIN_COLORS[c] ?? "#6b7a9e";
          return (
            <TouchableOpacity
              style={[styles.chainChip, { borderColor: c === chain ? col : colors.border, backgroundColor: c === chain ? col + "20" : colors.card }]}
              onPress={() => setChain(c)}
            >
              <Text style={[styles.chainLabel, { color: c === chain ? col : colors.mutedForeground }]}>
                {c === "All" ? "All Chains" : c.charAt(0).toUpperCase() + c.slice(1)}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* Sort */}
      <View style={styles.sortRow}>
        {SORTS.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.sortBtn, { backgroundColor: s === sort ? colors.primary + "20" : "transparent" }]}
            onPress={() => setSort(s)}
          >
            <Text style={[styles.sortLabel, { color: s === sort ? colors.primary : colors.mutedForeground }]}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Token list */}
      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : tokens.length === 0 ? (
        <EmptyState icon="globe" title="No tokens found" subtitle="Try a different chain or search term" />
      ) : (
        <FlatList
          data={tokens}
          keyExtractor={(t) => String(t.id)}
          contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: botPt + 30 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: t }) => {
            const change = parseFloat(t.priceChange24h ?? "0");
            const rc = riskColor(t.riskScore);
            const chainColor = CHAIN_COLORS[t.chain] ?? "#6b7a9e";
            const ageDays = Math.floor((Date.now() - new Date(t.discoveredAt).getTime()) / 86400000);
            return (
              <View style={[styles.tokenCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.tokenTop}>
                  <View style={styles.tokenLeft}>
                    <View style={[styles.tokenAvatar, { backgroundColor: chainColor + "20" }]}>
                      <Text style={[styles.tokenAvatarChar, { color: chainColor }]}>
                        {t.symbol.charAt(0)}
                      </Text>
                    </View>
                    <View>
                      <View style={styles.tokenNameRow}>
                        <Text style={[styles.tokenSymbol, { color: colors.foreground }]}>{t.symbol}</Text>
                        <View style={[styles.chainBadge, { backgroundColor: chainColor + "20" }]}>
                          <Text style={{ color: chainColor, fontSize: 9, fontWeight: "700" }}>
                            {t.chain.toUpperCase().slice(0, 4)}
                          </Text>
                        </View>
                        {ageDays <= 7 && (
                          <View style={[styles.newBadge, { backgroundColor: "#0ECB8120" }]}>
                            <Text style={{ color: "#0ECB81", fontSize: 9, fontWeight: "700" }}>NEW</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.tokenName, { color: colors.mutedForeground }]} numberOfLines={1}>{t.name}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.tokenPrice, { color: colors.foreground }]}>{fmtPrice(t.priceUsd)}</Text>
                    <Text style={[styles.tokenChange, { color: change >= 0 ? "#0ECB81" : "#F6465D" }]}>
                      {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                    </Text>
                  </View>
                </View>
                <View style={[styles.tokenBot, { borderTopColor: colors.border }]}>
                  <Text style={[styles.tokenMeta, { color: colors.mutedForeground }]}>Vol: {fmtCompact(t.volume24hUsd)}</Text>
                  <Text style={[styles.tokenMeta, { color: colors.mutedForeground }]}>MCap: {fmtCompact(t.marketCapUsd)}</Text>
                  <View style={[styles.riskBadge, { backgroundColor: rc + "20" }]}>
                    <View style={[styles.riskDot, { backgroundColor: rc }]} />
                    <Text style={{ color: rc, fontSize: 10, fontWeight: "700" }}>Risk: {riskLabel(t.riskScore)}</Text>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700" },
  statsBar: { flexDirection: "row", padding: 12, gap: 8 },
  statCard: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 10, alignItems: "center", gap: 3 },
  statVal: { fontSize: 13, fontWeight: "700" },
  statLabel: { fontSize: 10 },
  searchWrap: { flexDirection: "row", alignItems: "center", marginHorizontal: 14, marginBottom: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, gap: 8 },
  searchInput: { flex: 1, fontSize: 14 },
  filterList: { maxHeight: 40, marginBottom: 8 },
  chainChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  chainLabel: { fontSize: 12, fontWeight: "600" },
  sortRow: { flexDirection: "row", paddingHorizontal: 14, marginBottom: 6 },
  sortBtn: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: "center" },
  sortLabel: { fontSize: 12, fontWeight: "600" },
  tokenCard: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  tokenTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12 },
  tokenLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  tokenAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  tokenAvatarChar: { fontSize: 16, fontWeight: "800" },
  tokenNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  tokenSymbol: { fontSize: 14, fontWeight: "700" },
  chainBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  newBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  tokenName: { fontSize: 11, marginTop: 2, maxWidth: 150 },
  tokenPrice: { fontSize: 14, fontWeight: "700" },
  tokenChange: { fontSize: 12, marginTop: 2 },
  tokenBot: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 8 },
  tokenMeta: { fontSize: 11 },
  riskBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  riskDot: { width: 6, height: 6, borderRadius: 3 },
});
