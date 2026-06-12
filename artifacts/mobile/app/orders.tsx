import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/hooks/useApi";
import { EmptyState } from "@/components/EmptyState";

interface Order {
  id: number;
  pair: { base: string; quote: string } | null;
  side: string;
  type: string;
  amount: number;
  price?: number;
  filled: number;
  status: string;
  createdAt: string;
}

type Tab = "open" | "filled" | "cancelled";

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function OrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState<Tab>("open");

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["orders", tab],
    queryFn: () => apiFetch<Order[]>(`/api/exchange/order?status=${tab}`),
    enabled: isAuthenticated,
    refetchInterval: tab === "open" ? 5000 : 0,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/exchange/order/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["orders"] }),
  });

  const openCount = tab === "open" ? (data ?? []).length : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Orders</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={[styles.tabRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(["open", "filled", "cancelled"] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, t === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabLabel, { color: t === tab ? colors.primary : colors.mutedForeground }]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
            {t === "open" && openCount > 0 && (
              <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.countText}>{openCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {!isAuthenticated ? (
        <EmptyState icon="lock" title="Login required" subtitle="Sign in to see your orders" />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(o) => o.id.toString()}
          contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: botPt + 20, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void refetch()} tintColor={colors.primary} />}
          ListEmptyComponent={
            !isLoading ? (
              <EmptyState
                icon="list"
                title={`No ${tab} orders`}
                subtitle={tab === "open" ? "Place a trade to see your active orders" : "Your order history will appear here"}
              />
            ) : null
          }
          renderItem={({ item: o }) => {
            const pair = o.pair ? `${o.pair.base}/${o.pair.quote}` : "—";
            const fillPct = o.amount > 0 ? Math.min(100, (o.filled / o.amount) * 100) : 0;
            const isBuy = o.side === "buy";
            return (
              <View style={[styles.orderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cardTop}>
                  <View style={styles.cardTopLeft}>
                    <View style={[styles.sidePill, { backgroundColor: isBuy ? "#22c55e20" : "#e8151520" }]}>
                      <Feather
                        name={isBuy ? "trending-up" : "trending-down"}
                        size={11}
                        color={isBuy ? "#22c55e" : "#e81515"}
                      />
                      <Text style={[styles.sidePillText, { color: isBuy ? "#22c55e" : "#e81515" }]}>
                        {o.side.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.pairText, { color: colors.foreground }]}>{pair}</Text>
                    <Text style={[styles.typeText, { color: colors.mutedForeground }]}>
                      {o.type.charAt(0).toUpperCase() + o.type.slice(1)}
                    </Text>
                  </View>
                  <View style={styles.cardTopRight}>
                    <View style={[
                      styles.statusBadge,
                      { backgroundColor: o.status === "open" ? colors.primary + "20" : o.status === "filled" ? "#22c55e20" : colors.muted }
                    ]}>
                      <Text style={[
                        styles.statusText,
                        { color: o.status === "open" ? colors.primary : o.status === "filled" ? "#22c55e" : colors.mutedForeground }
                      ]}>
                        {o.status}
                      </Text>
                    </View>
                    <Text style={[styles.timeText, { color: colors.mutedForeground }]}>{timeAgo(o.createdAt)}</Text>
                  </View>
                </View>

                <View style={styles.statsRow}>
                  {[
                    { lbl: "Amount", val: o.amount.toFixed(4) },
                    { lbl: "Price", val: o.price ? `$${o.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "Market" },
                    { lbl: "Filled", val: `${fillPct.toFixed(0)}%` },
                  ].map((s) => (
                    <View key={s.lbl} style={styles.statCell}>
                      <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>{s.lbl}</Text>
                      <Text style={[styles.statVal, { color: colors.foreground }]}>{s.val}</Text>
                    </View>
                  ))}
                </View>

                {o.status === "open" && (
                  <>
                    <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
                      <View style={[styles.progressFill, { width: `${fillPct}%`, backgroundColor: isBuy ? "#22c55e" : "#e81515" }]} />
                    </View>
                    <View style={[styles.cancelRow, { borderTopColor: colors.border }]}>
                      <TouchableOpacity
                        style={[styles.cancelBtn, { borderColor: colors.destructive + "80" }]}
                        onPress={() => cancelMutation.mutate(o.id)}
                        disabled={cancelMutation.isPending && cancelMutation.variables === o.id}
                      >
                        <Feather name="x-circle" size={13} color="#e81515" />
                        <Text style={[styles.cancelLabel, { color: "#e81515" }]}>Cancel Order</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
                {(o.status === "filled" || o.status === "partially_filled") && (
                  <View style={[styles.cancelRow, { borderTopColor: colors.border }]}>
                    <TouchableOpacity
                      style={[styles.invoiceBtn, { borderColor: colors.primary + "60", backgroundColor: colors.primary + "10" }]}
                      onPress={() => router.push(`/trade-invoice/${o.id}` as any)}
                    >
                      <Feather name="file-text" size={13} color={colors.primary} />
                      <Text style={[styles.cancelLabel, { color: colors.primary }]}>View Tax Invoice</Text>
                    </TouchableOpacity>
                  </View>
                )}
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
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "700", textAlign: "center" },
  tabRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { flex: 1, flexDirection: "row", paddingVertical: 12, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent", gap: 5 },
  tabLabel: { fontSize: 13, fontWeight: "700" },
  countBadge: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  countText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  orderCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", padding: 12 },
  cardTopLeft: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  sidePill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, gap: 3 },
  sidePillText: { fontSize: 11, fontWeight: "800" },
  pairText: { fontSize: 14, fontWeight: "700" },
  typeText: { fontSize: 12 },
  cardTopRight: { alignItems: "flex-end", gap: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  statusText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  timeText: { fontSize: 11 },
  statsRow: { flexDirection: "row", paddingHorizontal: 12, paddingBottom: 10 },
  statCell: { flex: 1 },
  statLbl: { fontSize: 10, fontWeight: "600", textTransform: "uppercase" },
  statVal: { fontSize: 13, fontWeight: "700", marginTop: 2 },
  progressTrack: { height: 3, marginHorizontal: 12, borderRadius: 2, marginBottom: 10 },
  progressFill: { height: 3, borderRadius: 2 },
  cancelRow: { borderTopWidth: StyleSheet.hairlineWidth, padding: 10 },
  cancelBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  cancelLabel: { fontSize: 13, fontWeight: "700" },
  invoiceBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
});
