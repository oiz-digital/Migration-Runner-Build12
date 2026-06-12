import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
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

interface OptionsMarket {
  id: number;
  underlying: string;
  strike: number;
  expiry: string;
  optionType: "call" | "put";
  markPrice: number;
  impliedVol: number;
  delta: number;
  openInterest: number;
  bid: number;
  ask: number;
}

interface OptionsPosition {
  id: number;
  market: OptionsMarket;
  size: string;
  avgPremium: string;
  currentPremium: string;
  pnl: string;
  pnlPct: string;
  side: "long" | "short";
  marginLocked: string;
  status: string;
}

const UNDERLYINGS = ["BTC", "ETH", "SOL", "BNB"];

function fmtPrice(n: number) {
  if (n >= 1000) return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 1) return "$" + n.toFixed(2);
  return "$" + n.toFixed(4);
}

function daysUntil(iso: string) {
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  return d <= 0 ? "Expired" : d === 1 ? "1d" : `${d}d`;
}

export default function OptionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const qc = useQueryClient();
  const { priceMap } = usePrices();

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const [tab, setTab] = useState<"market" | "positions">("market");
  const [underlying, setUnderlying] = useState("BTC");
  const [optionType, setOptionType] = useState<"call" | "put">("call");
  const [selected, setSelected] = useState<OptionsMarket | null>(null);
  const [size, setSize] = useState("1");
  const [showOrder, setShowOrder] = useState(false);

  const spotPrice = useMemo(() => {
    const key = `${underlying}/USDT`;
    const v = priceMap[key];
    return v ? parseFloat(String(v)) : 0;
  }, [priceMap, underlying]);

  const marketsQ = useQuery<{ markets: OptionsMarket[] }>({
    queryKey: ["options-market", underlying],
    queryFn: () => apiFetch(`/api/options/market?underlying=${underlying}`),
    refetchInterval: 10_000,
  });

  const positionsQ = useQuery<{ positions: OptionsPosition[] }>({
    queryKey: ["options-positions"],
    queryFn: () => apiFetch("/api/options/position"),
    enabled: isAuthenticated && tab === "positions",
  });

  const buyMut = useMutation({
    mutationFn: () => apiPost("/api/options/order", {
      marketId: selected?.id,
      side: "long",
      size: parseFloat(size),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["options-positions"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowOrder(false); setSelected(null); setSize("1");
      Alert.alert("Order Placed", "Your options position has been opened");
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const closeMut = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/options/position/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["options-positions"] }),
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const markets = (marketsQ.data?.markets ?? []).filter((m) => m.optionType === optionType);
  const positions = positionsQ.data?.positions ?? [];
  const totalPnl = positions.reduce((s, p) => s + parseFloat(p.pnl ?? "0"), 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={["#0a0818", "#080e1a"]} style={[styles.header, { paddingTop: topPt + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Options</Text>
          {spotPrice > 0 && (
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
              {underlying} {fmtPrice(spotPrice)}
            </Text>
          )}
        </View>
        <View style={{ width: 40 }} />
      </LinearGradient>

      {/* Underlying selector */}
      <FlatList
        data={UNDERLYINGS}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(u) => u}
        style={styles.underlyingList}
        contentContainerStyle={{ paddingHorizontal: 14, gap: 8 }}
        renderItem={({ item: u }) => (
          <TouchableOpacity
            style={[styles.underlyingChip, {
              backgroundColor: u === underlying ? colors.primary + "20" : colors.card,
              borderColor: u === underlying ? colors.primary : colors.border,
            }]}
            onPress={() => setUnderlying(u)}
          >
            <Text style={[styles.underlyingLabel, { color: u === underlying ? colors.primary : colors.mutedForeground }]}>{u}</Text>
          </TouchableOpacity>
        )}
      />

      {/* Tabs */}
      <View style={styles.tabRow}>
        {(["market", "positions"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, { borderColor: t === tab ? colors.primary : colors.border, backgroundColor: t === tab ? colors.primary + "15" : colors.card }]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabLabel, { color: t === tab ? colors.primary : colors.mutedForeground }]}>
              {t === "market" ? "Option Chain" : `Positions${positions.length ? ` (${positions.length})` : ""}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "market" ? (
        <>
          {/* Call / Put toggle */}
          <View style={styles.typeRow}>
            {(["call", "put"] as const).map((tp) => (
              <TouchableOpacity
                key={tp}
                style={[styles.typeBtn, {
                  flex: 1,
                  backgroundColor: optionType === tp ? (tp === "call" ? "#0ECB8120" : "#F6465D20") : colors.card,
                  borderColor: optionType === tp ? (tp === "call" ? "#0ECB81" : "#F6465D") : colors.border,
                }]}
                onPress={() => setOptionType(tp)}
              >
                <Feather name={tp === "call" ? "trending-up" : "trending-down"} size={16} color={optionType === tp ? (tp === "call" ? "#0ECB81" : "#F6465D") : colors.mutedForeground} />
                <Text style={{ color: optionType === tp ? (tp === "call" ? "#0ECB81" : "#F6465D") : colors.mutedForeground, fontWeight: "700" }}>
                  {tp.charAt(0).toUpperCase() + tp.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Column headers */}
          <View style={[styles.colHeader, { borderBottomColor: colors.border }]}>
            {["Strike", "Mark", "IV", "Delta", "Exp"].map((h) => (
              <Text key={h} style={[styles.colHeaderText, { color: colors.mutedForeground }]}>{h}</Text>
            ))}
            <Text style={[styles.colHeaderText, { color: colors.mutedForeground }]}>Action</Text>
          </View>

          {marketsQ.isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : markets.length === 0 ? (
            <EmptyState icon="activity" title="No options available" subtitle="Options markets will appear here" />
          ) : (
            <FlatList
              data={markets}
              keyExtractor={(m) => String(m.id)}
              contentContainerStyle={{ paddingBottom: botPt + 30 }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: m }) => {
                const itm = spotPrice > 0 && (
                  optionType === "call" ? m.strike < spotPrice : m.strike > spotPrice
                );
                return (
                  <View style={[styles.optionRow, { backgroundColor: itm ? colors.primary + "08" : "transparent", borderBottomColor: colors.border }]}>
                    <Text style={[styles.optionCell, { color: colors.foreground, fontWeight: "700" }]}>
                      {m.strike >= 1000 ? `$${(m.strike / 1000).toFixed(0)}K` : `$${m.strike}`}
                    </Text>
                    <Text style={[styles.optionCell, { color: optionType === "call" ? "#0ECB81" : "#F6465D" }]}>
                      {fmtPrice(m.markPrice)}
                    </Text>
                    <Text style={[styles.optionCell, { color: colors.mutedForeground }]}>
                      {(m.impliedVol * 100).toFixed(0)}%
                    </Text>
                    <Text style={[styles.optionCell, { color: colors.mutedForeground }]}>
                      {m.delta.toFixed(2)}
                    </Text>
                    <Text style={[styles.optionCell, { color: colors.mutedForeground }]}>
                      {daysUntil(m.expiry)}
                    </Text>
                    <TouchableOpacity
                      style={[styles.buyBtn, { backgroundColor: optionType === "call" ? "#0ECB8120" : "#F6465D20" }]}
                      onPress={() => { setSelected(m); setShowOrder(true); }}
                    >
                      <Text style={{ color: optionType === "call" ? "#0ECB81" : "#F6465D", fontWeight: "700", fontSize: 11 }}>
                        BUY
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              }}
            />
          )}
        </>
      ) : (
        /* Positions */
        <>
          {positions.length > 0 && (
            <View style={[styles.pnlBanner, {
              backgroundColor: totalPnl >= 0 ? "#0ECB8115" : "#F6465D15",
              borderColor: totalPnl >= 0 ? "#0ECB8140" : "#F6465D40",
            }]}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Total Unrealized PnL</Text>
              <Text style={[styles.pnlTotal, { color: totalPnl >= 0 ? "#0ECB81" : "#F6465D" }]}>
                {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(4)} USDT
              </Text>
            </View>
          )}
          {positionsQ.isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : positions.length === 0 ? (
            <EmptyState icon="activity" title="No open positions" subtitle="Buy options from the Option Chain tab" />
          ) : (
            <FlatList
              data={positions}
              keyExtractor={(p) => String(p.id)}
              contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: botPt + 30 }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: p }) => {
                const pnl = parseFloat(p.pnl ?? "0");
                const isCall = p.market?.optionType === "call";
                return (
                  <View style={[styles.posCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.posTop}>
                      <View>
                        <View style={styles.posTitle}>
                          <View style={[styles.posBadge, { backgroundColor: isCall ? "#0ECB8120" : "#F6465D20" }]}>
                            <Text style={{ color: isCall ? "#0ECB81" : "#F6465D", fontSize: 10, fontWeight: "800" }}>
                              {isCall ? "CALL" : "PUT"}
                            </Text>
                          </View>
                          <Text style={[styles.posStrike, { color: colors.foreground }]}>
                            {p.market?.underlying} ${p.market?.strike?.toLocaleString()}
                          </Text>
                        </View>
                        <Text style={[styles.posExp, { color: colors.mutedForeground }]}>
                          Expiry: {p.market?.expiry ? new Date(p.market.expiry).toLocaleDateString("en-IN") : "—"}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[styles.posPnl, { color: pnl >= 0 ? "#0ECB81" : "#F6465D" }]}>
                          {pnl >= 0 ? "+" : ""}{pnl.toFixed(4)}
                        </Text>
                        <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Unrealized PnL</Text>
                      </View>
                    </View>
                    <View style={[styles.posDetails, { borderTopColor: colors.border }]}>
                      {[
                        { label: "Size", value: parseFloat(p.size).toFixed(4) },
                        { label: "Avg Premium", value: fmtPrice(parseFloat(p.avgPremium)) },
                        { label: "Mark", value: fmtPrice(parseFloat(p.currentPremium)) },
                        { label: "Margin", value: `$${parseFloat(p.marginLocked).toFixed(2)}` },
                      ].map((d) => (
                        <View key={d.label} style={styles.posDetail}>
                          <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>{d.label}</Text>
                          <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>{d.value}</Text>
                        </View>
                      ))}
                    </View>
                    <TouchableOpacity
                      style={[styles.closeBtn, { borderColor: "#F6465D50" }]}
                      onPress={() => Alert.alert("Close Position", "Close this options position?", [
                        { text: "Cancel", style: "cancel" },
                        { text: "Close", style: "destructive", onPress: () => closeMut.mutate(p.id) },
                      ])}
                    >
                      <Feather name="x-circle" size={14} color="#F6465D" />
                      <Text style={{ color: "#F6465D", fontWeight: "600", fontSize: 13 }}>Close Position</Text>
                    </TouchableOpacity>
                  </View>
                );
              }}
            />
          )}
        </>
      )}

      {/* Buy Order Modal */}
      <Modal visible={showOrder} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHandle} />
            {selected && (
              <>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  Buy {selected.underlying} {selected.optionType === "call" ? "Call" : "Put"}
                </Text>
                <View style={[styles.orderSummary, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  {[
                    { label: "Strike", value: `$${selected.strike.toLocaleString()}` },
                    { label: "Mark Price", value: fmtPrice(selected.markPrice) },
                    { label: "IV", value: `${(selected.impliedVol * 100).toFixed(1)}%` },
                    { label: "Expiry", value: daysUntil(selected.expiry) },
                    { label: "Delta", value: selected.delta.toFixed(3) },
                  ].map((r) => (
                    <View key={r.label} style={styles.summaryRow2}>
                      <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{r.label}</Text>
                      <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 13 }}>{r.value}</Text>
                    </View>
                  ))}
                </View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>CONTRACT SIZE</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                  value={size}
                  onChangeText={setSize}
                  keyboardType="decimal-pad"
                  placeholder="1"
                  placeholderTextColor={colors.mutedForeground}
                />
                <View style={[styles.costRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <Text style={{ color: colors.mutedForeground }}>Total Cost</Text>
                  <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 16 }}>
                    {fmtPrice(selected.markPrice * parseFloat(size || "0"))} USDT
                  </Text>
                </View>
                <View style={styles.modalBtns}>
                  <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.muted }]} onPress={() => setShowOrder(false)}>
                    <Text style={{ color: colors.foreground, fontWeight: "700" }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: selected.optionType === "call" ? "#0ECB81" : "#F6465D" }]}
                    onPress={() => buyMut.mutate()}
                    disabled={buyMut.isPending}
                  >
                    {buyMut.isPending ? <ActivityIndicator color="#fff" size="small" /> : (
                      <Text style={{ color: "#fff", fontWeight: "700" }}>
                        Buy {selected.optionType === "call" ? "Call" : "Put"}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
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
  headerSub: { textAlign: "center", fontSize: 12 },
  underlyingList: { maxHeight: 44, marginVertical: 8 },
  underlyingChip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  underlyingLabel: { fontWeight: "700", fontSize: 13 },
  tabRow: { flexDirection: "row", gap: 8, paddingHorizontal: 14, marginBottom: 8 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  tabLabel: { fontSize: 13, fontWeight: "600" },
  typeRow: { flexDirection: "row", gap: 8, paddingHorizontal: 14, marginBottom: 8 },
  typeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  colHeader: { flexDirection: "row", paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  colHeaderText: { flex: 1, fontSize: 10, fontWeight: "600", textAlign: "center" },
  optionRow: { flexDirection: "row", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: "center" },
  optionCell: { flex: 1, fontSize: 12, textAlign: "center" },
  buyBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  pnlBanner: { marginHorizontal: 14, marginVertical: 8, borderRadius: 10, borderWidth: 1, padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pnlTotal: { fontSize: 16, fontWeight: "800" },
  posCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  posTop: { flexDirection: "row", justifyContent: "space-between", padding: 14 },
  posTitle: { flexDirection: "row", alignItems: "center", gap: 6 },
  posBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  posStrike: { fontSize: 15, fontWeight: "700" },
  posExp: { fontSize: 11, marginTop: 4 },
  posPnl: { fontSize: 16, fontWeight: "800" },
  posDetails: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, padding: 12 },
  posDetail: { flex: 1, alignItems: "center", gap: 2 },
  closeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 12, borderTopWidth: 1 },
  modalOverlay: { flex: 1, backgroundColor: "#000000cc", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 36, height: 4, backgroundColor: "#ffffff30", borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 16 },
  orderSummary: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 16, gap: 8 },
  summaryRow2: { flexDirection: "row", justifyContent: "space-between" },
  fieldLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 10, padding: 13, fontSize: 15, marginBottom: 12 },
  costRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: 10, borderWidth: 1, padding: 14, marginBottom: 16 },
  modalBtns: { flexDirection: "row", gap: 10 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
});
