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
  TouchableOpacity,
  View,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/hooks/useApi";
import { EmptyState } from "@/components/EmptyState";

interface LedgerEntry {
  id: number;
  type: string;
  currency: string;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  description: string;
  createdAt: string;
  reference?: string;
}

const TYPE_META: Record<string, { icon: keyof typeof Feather.glyphMap; color: string; label: string }> = {
  deposit: { icon: "arrow-down-circle", color: "#0ECB81", label: "Deposit" },
  withdrawal: { icon: "arrow-up-circle", color: "#F6465D", label: "Withdrawal" },
  trade_buy: { icon: "trending-up", color: "#0ECB81", label: "Buy" },
  trade_sell: { icon: "trending-down", color: "#F6465D", label: "Sell" },
  fee: { icon: "minus-circle", color: "#f59e0b", label: "Fee" },
  transfer: { icon: "repeat", color: "#627eea", label: "Transfer" },
  referral: { icon: "gift", color: "#9945ff", label: "Referral" },
  earn: { icon: "percent", color: "#0ECB81", label: "Earn" },
  ai_profit: { icon: "cpu", color: "#0ECB81", label: "AI Profit" },
  ai_invest: { icon: "cpu", color: "#F6465D", label: "AI Invest" },
  default: { icon: "activity", color: "#6b7a9e", label: "Transaction" },
};

const FILTERS = ["All", "Deposit", "Withdrawal", "Trade", "Earn", "Fee"];

function fmt(n: string | number) {
  const v = parseFloat(String(n));
  if (isNaN(v)) return "0.00";
  return Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    "  " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export default function LedgerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery<{ entries: LedgerEntry[]; total: number }>({
    queryKey: ["ledger", filter, page],
    queryFn: () => {
      const type = filter === "All" ? "" : filter.toLowerCase();
      return apiFetch(`/api/finance/transaction?type=${type}&page=${page}&limit=30`);
    },
    enabled: isAuthenticated,
    staleTime: 20_000,
  });

  const entries = (data?.entries ?? []).filter((e) =>
    !search || e.currency.toUpperCase().includes(search.toUpperCase()) ||
    e.description?.toLowerCase().includes(search.toLowerCase()) ||
    e.type?.toLowerCase().includes(search.toLowerCase())
  );

  const getMeta = (type: string) => TYPE_META[type] ?? TYPE_META.default;
  const isCredit = (type: string) => ["deposit", "trade_buy", "earn", "ai_profit", "referral"].includes(type);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={["#0d1524", "#080e1a"]}
        style={[styles.header, { paddingTop: topPt + 12 }]}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Ledger</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => refetch()}>
          <Feather name="refresh-cw" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </LinearGradient>

      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={15} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Search transactions..."
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

      {/* Filter chips */}
      <FlatList
        data={FILTERS}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(f) => f}
        style={styles.filterList}
        contentContainerStyle={{ paddingHorizontal: 14, gap: 8 }}
        renderItem={({ item: f }) => (
          <TouchableOpacity
            style={[styles.filterChip, {
              backgroundColor: f === filter ? colors.primary + "20" : colors.card,
              borderColor: f === filter ? colors.primary : colors.border,
            }]}
            onPress={() => { setFilter(f); setPage(1); }}
          >
            <Text style={[styles.filterLabel, { color: f === filter ? colors.primary : colors.mutedForeground }]}>
              {f}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Entries */}
      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon="file-text"
          title="No transactions"
          subtitle="Your ledger entries will appear here"
        />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => String(e.id)}
          contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: botPt + 30 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: e }) => {
            const meta = getMeta(e.type);
            const credit = isCredit(e.type);
            const amt = parseFloat(e.amount);
            return (
              <View style={[styles.entryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.entryIcon, { backgroundColor: meta.color + "18" }]}>
                  <Feather name={meta.icon} size={18} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.entryTop}>
                    <Text style={[styles.entryType, { color: colors.foreground }]}>{meta.label}</Text>
                    <Text style={[styles.entryAmt, { color: credit ? "#0ECB81" : "#F6465D" }]}>
                      {credit ? "+" : "-"}{fmt(e.amount)} {e.currency}
                    </Text>
                  </View>
                  <View style={styles.entryMid}>
                    <Text style={[styles.entryDesc, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {e.description || e.type.replace(/_/g, " ")}
                    </Text>
                  </View>
                  <View style={styles.entryBot}>
                    <Text style={[styles.entryBal, { color: colors.mutedForeground }]}>
                      Bal: {fmt(e.balanceAfter)} {e.currency}
                    </Text>
                    <Text style={[styles.entryDate, { color: colors.mutedForeground }]}>
                      {fmtDate(e.createdAt)}
                    </Text>
                  </View>
                  {e.reference && (
                    <Text style={[styles.entryRef, { color: colors.mutedForeground + "80" }]} numberOfLines={1}>
                      Ref: {e.reference}
                    </Text>
                  )}
                </View>
              </View>
            );
          }}
          ListFooterComponent={
            (data?.total ?? 0) > page * 30 ? (
              <TouchableOpacity
                style={[styles.loadMore, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => setPage((p) => p + 1)}
              >
                <Text style={{ color: colors.primary, fontWeight: "600" }}>Load More</Text>
              </TouchableOpacity>
            ) : null
          }
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
  searchWrap: { flexDirection: "row", alignItems: "center", marginHorizontal: 14, marginVertical: 10, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, gap: 8 },
  searchInput: { flex: 1, fontSize: 14 },
  filterList: { maxHeight: 44, marginBottom: 4 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  filterLabel: { fontSize: 13, fontWeight: "600" },
  entryCard: { borderRadius: 12, borderWidth: 1, padding: 14, flexDirection: "row", gap: 12, alignItems: "flex-start" },
  entryIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", marginTop: 2 },
  entryTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  entryMid: { marginTop: 3 },
  entryBot: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  entryType: { fontSize: 14, fontWeight: "700" },
  entryAmt: { fontSize: 14, fontWeight: "700" },
  entryDesc: { fontSize: 12 },
  entryBal: { fontSize: 11 },
  entryDate: { fontSize: 11 },
  entryRef: { fontSize: 10, marginTop: 2 },
  loadMore: { marginTop: 10, borderRadius: 10, borderWidth: 1, padding: 14, alignItems: "center" },
});
