import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch, apiPost, apiDelete } from "@/hooks/useApi";
import { usePrices } from "@/hooks/usePrices";
import { EmptyState } from "@/components/EmptyState";

interface PriceAlert {
  id: number;
  symbol: string;
  targetPrice: string;
  direction: "above" | "below";
  triggered: boolean;
  active: boolean;
  note?: string;
  createdAt: string;
}

const POPULAR_PAIRS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT", "AVAX/USDT"];

function fmtPrice(n: number) {
  if (n >= 10000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return n.toFixed(6);
}

export default function PriceAlertsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const qc = useQueryClient();
  const { priceMap } = usePrices();

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const [showCreate, setShowCreate] = useState(false);
  const [pair, setPair] = useState("BTC/USDT");
  const [targetPrice, setTargetPrice] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [note, setNote] = useState("");
  const [tab, setTab] = useState<"active" | "triggered">("active");

  const alertsQ = useQuery<{ alerts: PriceAlert[] }>({
    queryKey: ["price-alerts"],
    queryFn: () => apiFetch("/api/user/price-alert"),
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  });

  const createMut = useMutation({
    mutationFn: () => apiPost("/api/user/price-alert", { symbol: pair, targetPrice: parseFloat(targetPrice), direction, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["price-alerts"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCreate(false);
      setTargetPrice("");
      setNote("");
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/user/price-alert/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["price-alerts"] }),
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const alerts = alertsQ.data?.alerts ?? [];
  const filteredAlerts = alerts.filter((a) => tab === "active" ? (a.active && !a.triggered) : a.triggered);

  const currentPrice = (() => {
    const [base, quote] = pair.split("/");
    const key = `${base}/${quote}`;
    const tick = priceMap[key] ?? priceMap[pair];
    return tick ? parseFloat(String(tick)) : 0;
  })();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={["#0d1524", "#080e1a"]}
        style={[styles.header, { paddingTop: topPt + 12 }]}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Price Alerts</Text>
        <TouchableOpacity
          style={[styles.createBtn, { backgroundColor: colors.primary }]}
          onPress={() => setShowCreate(true)}
        >
          <Feather name="plus" size={18} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      {/* Summary cards */}
      <View style={styles.summaryRow}>
        {[
          { label: "Active", value: alerts.filter((a) => a.active && !a.triggered).length, color: "#0ECB81", icon: "bell" as const },
          { label: "Triggered", value: alerts.filter((a) => a.triggered).length, color: "#f59e0b", icon: "zap" as const },
          { label: "Total", value: alerts.length, color: colors.primary, icon: "list" as const },
        ].map((s) => (
          <View key={s.label} style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name={s.icon} size={18} color={s.color} />
            <Text style={[styles.summaryVal, { color: s.color }]}>{s.value}</Text>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Tab */}
      <View style={styles.tabRow}>
        {(["active", "triggered"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, { borderColor: t === tab ? colors.primary : colors.border, backgroundColor: t === tab ? colors.primary + "15" : colors.card }]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabLabel, { color: t === tab ? colors.primary : colors.mutedForeground }]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {alertsQ.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      ) : filteredAlerts.length === 0 ? (
        <EmptyState
          icon="bell"
          title={tab === "active" ? "No active alerts" : "No triggered alerts"}
          subtitle={tab === "active" ? "Tap + to create your first price alert" : "Triggered alerts will appear here"}
        />
      ) : (
        <FlatList
          data={filteredAlerts}
          keyExtractor={(a) => String(a.id)}
          contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: botPt + 30 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: a }) => {
            const triggered = a.triggered;
            const dirColor = a.direction === "above" ? "#0ECB81" : "#F6465D";
            return (
              <View style={[styles.alertCard, { backgroundColor: colors.card, borderColor: triggered ? "#f59e0b40" : colors.border }]}>
                <View style={styles.alertTop}>
                  <View style={styles.alertLeft}>
                    <View style={[styles.alertIcon, { backgroundColor: dirColor + "20" }]}>
                      <Feather name={a.direction === "above" ? "arrow-up" : "arrow-down"} size={16} color={dirColor} />
                    </View>
                    <View>
                      <Text style={[styles.alertPair, { color: colors.foreground }]}>{a.symbol}</Text>
                      <Text style={[styles.alertDir, { color: colors.mutedForeground }]}>
                        {a.direction === "above" ? "Price goes above" : "Price drops below"}
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.alertTarget, { color: colors.foreground }]}>
                      ${parseFloat(a.targetPrice).toLocaleString("en-US", { maximumFractionDigits: 4 })}
                    </Text>
                    {triggered && (
                      <View style={[styles.triggeredBadge, { backgroundColor: "#f59e0b20" }]}>
                        <Text style={{ color: "#f59e0b", fontSize: 10, fontWeight: "700" }}>TRIGGERED</Text>
                      </View>
                    )}
                  </View>
                </View>
                {a.note && (
                  <Text style={[styles.alertNote, { color: colors.mutedForeground }]}>{a.note}</Text>
                )}
                <View style={styles.alertBot}>
                  <Text style={[styles.alertDate, { color: colors.mutedForeground }]}>
                    {new Date(a.createdAt).toLocaleDateString("en-IN")}
                  </Text>
                  <TouchableOpacity
                    style={[styles.deleteBtn, { backgroundColor: "#F6465D15", borderColor: "#F6465D30" }]}
                    onPress={() => Alert.alert("Delete Alert", "Remove this price alert?", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => deleteMut.mutate(a.id) },
                    ])}
                  >
                    <Feather name="trash-2" size={13} color="#F6465D" />
                    <Text style={{ color: "#F6465D", fontSize: 12, fontWeight: "600" }}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Create Alert Modal */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Create Price Alert</Text>

            {/* Pair selector */}
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>TRADING PAIR</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {POPULAR_PAIRS.map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.pairChip, { borderColor: p === pair ? colors.primary : colors.border, backgroundColor: p === pair ? colors.primary + "20" : colors.muted }]}
                    onPress={() => {
                      setPair(p);
                      const [base] = p.split("/");
                      const price = priceMap[p] ?? 0;
                      if (price) setTargetPrice(fmtPrice(parseFloat(String(price))));
                    }}
                  >
                    <Text style={{ color: p === pair ? colors.primary : colors.mutedForeground, fontWeight: "700", fontSize: 13 }}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Current price */}
            {currentPrice > 0 && (
              <View style={[styles.currentPriceRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Current Price</Text>
                <Text style={{ color: colors.foreground, fontWeight: "700" }}>${fmtPrice(currentPrice)}</Text>
              </View>
            )}

            {/* Direction */}
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ALERT WHEN PRICE</Text>
            <View style={styles.dirRow}>
              {(["above", "below"] as const).map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.dirBtn, {
                    flex: 1,
                    borderColor: direction === d ? (d === "above" ? "#0ECB81" : "#F6465D") : colors.border,
                    backgroundColor: direction === d ? (d === "above" ? "#0ECB8120" : "#F6465D20") : colors.muted,
                  }]}
                  onPress={() => setDirection(d)}
                >
                  <Feather name={d === "above" ? "arrow-up" : "arrow-down"} size={16} color={direction === d ? (d === "above" ? "#0ECB81" : "#F6465D") : colors.mutedForeground} />
                  <Text style={{ color: direction === d ? (d === "above" ? "#0ECB81" : "#F6465D") : colors.mutedForeground, fontWeight: "700" }}>
                    Goes {d.charAt(0).toUpperCase() + d.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Target price */}
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>TARGET PRICE (USD)</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
              placeholder="e.g. 70000"
              placeholderTextColor={colors.mutedForeground}
              value={targetPrice}
              onChangeText={setTargetPrice}
              keyboardType="decimal-pad"
            />

            {/* Note */}
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>NOTE (Optional)</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
              placeholder="e.g. Take profit level"
              placeholderTextColor={colors.mutedForeground}
              value={note}
              onChangeText={setNote}
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.muted }]}
                onPress={() => setShowCreate(false)}
              >
                <Text style={{ color: colors.foreground, fontWeight: "700" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                onPress={() => createMut.mutate()}
                disabled={!targetPrice || createMut.isPending}
              >
                {createMut.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "700" }}>Create Alert</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700" },
  createBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  summaryRow: { flexDirection: "row", padding: 14, gap: 10 },
  summaryCard: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 14, alignItems: "center", gap: 4 },
  summaryVal: { fontSize: 22, fontWeight: "800" },
  summaryLabel: { fontSize: 11 },
  tabRow: { flexDirection: "row", gap: 8, paddingHorizontal: 14, marginBottom: 10 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  tabLabel: { fontSize: 14, fontWeight: "600" },
  alertCard: { borderRadius: 14, borderWidth: 1, padding: 16 },
  alertTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  alertLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  alertIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  alertPair: { fontSize: 15, fontWeight: "700" },
  alertDir: { fontSize: 12, marginTop: 1 },
  alertTarget: { fontSize: 16, fontWeight: "800" },
  triggeredBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 4 },
  alertNote: { fontSize: 12, marginTop: 8, fontStyle: "italic" },
  alertBot: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  alertDate: { fontSize: 11 },
  deleteBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  modalOverlay: { flex: 1, backgroundColor: "#000000cc", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 36, height: 4, backgroundColor: "#ffffff30", borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: "800", textAlign: "center", marginBottom: 20 },
  fieldLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 8 },
  pairChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  currentPriceRow: { flexDirection: "row", justifyContent: "space-between", borderRadius: 8, borderWidth: 1, padding: 10, marginBottom: 16 },
  dirRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  dirBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 10, borderWidth: 1 },
  input: { borderWidth: 1, borderRadius: 10, padding: 13, fontSize: 15, marginBottom: 16 },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
