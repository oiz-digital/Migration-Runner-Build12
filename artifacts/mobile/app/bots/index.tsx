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
import { apiFetch, apiPost, apiPut, apiDelete } from "@/hooks/useApi";
import { EmptyState } from "@/components/EmptyState";

interface Bot {
  id: number;
  name: string;
  type: string;
  pair: string;
  status: "active" | "paused" | "stopped";
  pnl: string;
  pnlPct: string;
  totalTrades: number;
  winRate: string;
  createdAt: string;
  settings?: BotSettings;
}

interface BotSettings {
  lowerPrice?: number;
  upperPrice?: number;
  gridLines?: number;
  investmentAmount?: number;
  takeProfitPct?: number;
  stopLossPct?: number;
  leverage?: number;
}

const BOT_TYPES = [
  { type: "grid", name: "Grid Bot", desc: "Buys low, sells high within a price range", icon: "grid" as const, color: "#eb9100" },
  { type: "dca", name: "DCA Bot", desc: "Dollar cost averaging at fixed intervals", icon: "repeat" as const, color: "#0ECB81" },
  { type: "macd", name: "MACD Bot", desc: "Signal-based momentum trading", icon: "activity" as const, color: "#627eea" },
  { type: "arbitrage", name: "Arbitrage Bot", desc: "Exploit price differences between pairs", icon: "zap" as const, color: "#9945ff" },
];

const PAIRS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT"];

const STATUS_META = {
  active: { color: "#0ECB81", label: "Running", icon: "play-circle" as const },
  paused: { color: "#f59e0b", label: "Paused", icon: "pause-circle" as const },
  stopped: { color: "#6b7a9e", label: "Stopped", icon: "stop-circle" as const },
};

export default function BotsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const qc = useQueryClient();

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const [tab, setTab] = useState<"my" | "templates">("templates");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedType, setSelectedType] = useState(BOT_TYPES[0]);
  const [pair, setPair] = useState(PAIRS[0]);
  const [investment, setInvestment] = useState("100");
  const [lower, setLower] = useState("");
  const [upper, setUpper] = useState("");
  const [grids, setGrids] = useState("10");
  const [tp, setTp] = useState("5");
  const [sl, setSl] = useState("3");

  const botsQ = useQuery<{ bots: Bot[] }>({
    queryKey: ["bots"],
    queryFn: () => apiFetch("/api/bot"),
    enabled: isAuthenticated,
    refetchInterval: 15_000,
  });

  const createMut = useMutation({
    mutationFn: () => apiPost("/api/bot", {
      type: selectedType.type,
      pair,
      settings: { investmentAmount: parseFloat(investment), lowerPrice: parseFloat(lower), upperPrice: parseFloat(upper), gridLines: parseInt(grids), takeProfitPct: parseFloat(tp), stopLossPct: parseFloat(sl) },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bots"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCreate(false);
      setTab("my");
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiPut(`/api/bot/${id}`, { status: status === "active" ? "paused" : "active" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bots"] }),
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/bot/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bots"] }),
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const bots = botsQ.data?.bots ?? [];
  const activeBots = bots.filter((b) => b.status === "active").length;
  const totalPnl = bots.reduce((s, b) => s + parseFloat(b.pnl ?? "0"), 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={["#0d1524", "#080e1a"]} style={[styles.header, { paddingTop: topPt + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Trading Bots</Text>
        <TouchableOpacity style={[styles.createBtn, { backgroundColor: colors.primary }]} onPress={() => setShowCreate(true)}>
          <Feather name="plus" size={18} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      {/* Stats row */}
      {bots.length > 0 && (
        <View style={styles.statsRow}>
          {[
            { label: "Active Bots", value: activeBots.toString(), color: "#0ECB81" },
            { label: "Total Bots", value: bots.length.toString(), color: colors.primary },
            { label: "Total PnL", value: `${totalPnl >= 0 ? "+" : ""}$${Math.abs(totalPnl).toFixed(2)}`, color: totalPnl >= 0 ? "#0ECB81" : "#F6465D" },
          ].map((s) => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabRow}>
        {(["templates", "my"] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tabBtn, { borderColor: t === tab ? colors.primary : colors.border, backgroundColor: t === tab ? colors.primary + "15" : colors.card }]} onPress={() => setTab(t)}>
            <Text style={[styles.tabLabel, { color: t === tab ? colors.primary : colors.mutedForeground }]}>
              {t === "templates" ? "Bot Types" : `My Bots${bots.length ? ` (${bots.length})` : ""}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "templates" ? (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: botPt + 30 }} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>AUTOMATED TRADING STRATEGIES</Text>
          {BOT_TYPES.map((bt) => (
            <TouchableOpacity
              key={bt.type}
              style={[styles.typeCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { setSelectedType(bt); setShowCreate(true); }}
            >
              <View style={[styles.typeIconWrap, { backgroundColor: bt.color + "20" }]}>
                <Feather name={bt.icon} size={24} color={bt.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.typeName, { color: colors.foreground }]}>{bt.name}</Text>
                <Text style={[styles.typeDesc, { color: colors.mutedForeground }]}>{bt.desc}</Text>
              </View>
              <View style={[styles.createChip, { backgroundColor: bt.color + "20" }]}>
                <Text style={{ color: bt.color, fontWeight: "700", fontSize: 12 }}>Create</Text>
                <Feather name="arrow-right" size={12} color={bt.color} />
              </View>
            </TouchableOpacity>
          ))}

          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="info" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoTitle, { color: colors.foreground }]}>About Trading Bots</Text>
              <Text style={[styles.infoDesc, { color: colors.mutedForeground }]}>
                Bots execute trades automatically 24/7 based on your configured strategy. Past performance does not guarantee future results. Trade responsibly.
              </Text>
            </View>
          </View>
        </ScrollView>
      ) : (
        botsQ.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
        ) : bots.length === 0 ? (
          <EmptyState icon="cpu" title="No bots running" subtitle="Create a trading bot to automate your strategy" />
        ) : (
          <FlatList
            data={bots}
            keyExtractor={(b) => String(b.id)}
            contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: botPt + 30 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: b }) => {
              const sm = STATUS_META[b.status];
              const pnl = parseFloat(b.pnl ?? "0");
              return (
                <View style={[styles.botCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.botTop}>
                    <View style={styles.botLeft}>
                      <View style={[styles.botIconWrap, { backgroundColor: colors.primary + "20" }]}>
                        <Feather name="cpu" size={20} color={colors.primary} />
                      </View>
                      <View>
                        <Text style={[styles.botName, { color: colors.foreground }]}>{b.name || `${b.type.toUpperCase()} Bot`}</Text>
                        <Text style={[styles.botPair, { color: colors.mutedForeground }]}>{b.pair}</Text>
                      </View>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: sm.color + "20" }]}>
                      <Feather name={sm.icon} size={11} color={sm.color} />
                      <Text style={{ color: sm.color, fontSize: 10, fontWeight: "700" }}>{sm.label}</Text>
                    </View>
                  </View>

                  <View style={[styles.botStats, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
                    {[
                      { label: "PnL", value: `${pnl >= 0 ? "+" : ""}$${Math.abs(pnl).toFixed(4)}`, color: pnl >= 0 ? "#0ECB81" : "#F6465D" },
                      { label: "Trades", value: b.totalTrades.toString(), color: colors.foreground },
                      { label: "Win Rate", value: `${b.winRate}%`, color: "#f59e0b" },
                    ].map((s) => (
                      <View key={s.label} style={styles.botStat}>
                        <Text style={[styles.botStatVal, { color: s.color }]}>{s.value}</Text>
                        <Text style={[styles.botStatLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.botActions}>
                    <TouchableOpacity
                      style={[styles.botActionBtn, { backgroundColor: b.status === "active" ? "#f59e0b15" : "#0ECB8115", borderColor: b.status === "active" ? "#f59e0b40" : "#0ECB8140" }]}
                      onPress={() => toggleMut.mutate({ id: b.id, status: b.status })}
                    >
                      <Feather name={b.status === "active" ? "pause" : "play"} size={14} color={b.status === "active" ? "#f59e0b" : "#0ECB81"} />
                      <Text style={{ color: b.status === "active" ? "#f59e0b" : "#0ECB81", fontSize: 12, fontWeight: "700" }}>
                        {b.status === "active" ? "Pause" : "Start"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.botActionBtn, { backgroundColor: "#F6465D15", borderColor: "#F6465D40" }]}
                      onPress={() => Alert.alert("Delete Bot", "Stop and delete this bot?", [
                        { text: "Cancel", style: "cancel" },
                        { text: "Delete", style: "destructive", onPress: () => deleteMut.mutate(b.id) },
                      ])}
                    >
                      <Feather name="trash-2" size={14} color="#F6465D" />
                      <Text style={{ color: "#F6465D", fontSize: 12, fontWeight: "700" }}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />
        )
      )}

      {/* Create Bot Modal */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView>
            <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.modalHandle} />
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Create {selectedType.name}</Text>

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>BOT TYPE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {BOT_TYPES.map((bt) => (
                    <TouchableOpacity key={bt.type} style={[styles.typeChip, { borderColor: bt.type === selectedType.type ? bt.color : colors.border, backgroundColor: bt.type === selectedType.type ? bt.color + "20" : colors.muted }]} onPress={() => setSelectedType(bt)}>
                      <Feather name={bt.icon} size={13} color={bt.type === selectedType.type ? bt.color : colors.mutedForeground} />
                      <Text style={{ color: bt.type === selectedType.type ? bt.color : colors.mutedForeground, fontWeight: "700", fontSize: 12 }}>{bt.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>TRADING PAIR</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {PAIRS.map((p) => (
                    <TouchableOpacity key={p} style={[styles.typeChip, { borderColor: p === pair ? colors.primary : colors.border, backgroundColor: p === pair ? colors.primary + "20" : colors.muted }]} onPress={() => setPair(p)}>
                      <Text style={{ color: p === pair ? colors.primary : colors.mutedForeground, fontWeight: "700", fontSize: 12 }}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>INVESTMENT (USDT)</Text>
              <TextInput style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]} value={investment} onChangeText={setInvestment} keyboardType="decimal-pad" placeholder="100" placeholderTextColor={colors.mutedForeground} />

              {selectedType.type === "grid" && (
                <>
                  <View style={styles.rangeRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>LOWER PRICE ($)</Text>
                      <TextInput style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]} value={lower} onChangeText={setLower} keyboardType="decimal-pad" placeholder="e.g. 60000" placeholderTextColor={colors.mutedForeground} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>UPPER PRICE ($)</Text>
                      <TextInput style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]} value={upper} onChangeText={setUpper} keyboardType="decimal-pad" placeholder="e.g. 70000" placeholderTextColor={colors.mutedForeground} />
                    </View>
                  </View>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>GRID LINES</Text>
                  <TextInput style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]} value={grids} onChangeText={setGrids} keyboardType="number-pad" placeholder="10" placeholderTextColor={colors.mutedForeground} />
                </>
              )}

              <View style={styles.rangeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: "#0ECB81" }]}>TAKE PROFIT (%)</Text>
                  <TextInput style={[styles.input, { color: colors.foreground, borderColor: "#0ECB8140", backgroundColor: colors.muted }]} value={tp} onChangeText={setTp} keyboardType="decimal-pad" placeholder="5" placeholderTextColor={colors.mutedForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: "#F6465D" }]}>STOP LOSS (%)</Text>
                  <TextInput style={[styles.input, { color: colors.foreground, borderColor: "#F6465D40", backgroundColor: colors.muted }]} value={sl} onChangeText={setSl} keyboardType="decimal-pad" placeholder="3" placeholderTextColor={colors.mutedForeground} />
                </View>
              </View>

              <View style={styles.modalBtns}>
                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.muted }]} onPress={() => setShowCreate(false)}>
                  <Text style={{ color: colors.foreground, fontWeight: "700" }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: selectedType.color }]} onPress={() => createMut.mutate()} disabled={createMut.isPending}>
                  {createMut.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Launch Bot</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
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
  statsRow: { flexDirection: "row", padding: 14, gap: 8 },
  statCard: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 10, alignItems: "center" },
  statVal: { fontSize: 15, fontWeight: "800" },
  statLabel: { fontSize: 10, marginTop: 2 },
  tabRow: { flexDirection: "row", gap: 8, paddingHorizontal: 14, marginBottom: 8 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  tabLabel: { fontSize: 13, fontWeight: "600" },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 4 },
  typeCard: { borderRadius: 14, borderWidth: 1, padding: 16, flexDirection: "row", alignItems: "center", gap: 14 },
  typeIconWrap: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  typeName: { fontSize: 15, fontWeight: "700" },
  typeDesc: { fontSize: 12, marginTop: 2 },
  createChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  infoCard: { borderRadius: 12, borderWidth: 1, padding: 14, flexDirection: "row", gap: 12 },
  infoTitle: { fontSize: 14, fontWeight: "700", marginBottom: 4 },
  infoDesc: { fontSize: 12, lineHeight: 18 },
  botCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  botTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14 },
  botLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  botIconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  botName: { fontSize: 15, fontWeight: "700" },
  botPair: { fontSize: 12, marginTop: 1 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  botStats: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  botStat: { flex: 1, alignItems: "center" },
  botStatVal: { fontSize: 13, fontWeight: "700" },
  botStatLabel: { fontSize: 10, marginTop: 2 },
  botActions: { flexDirection: "row", gap: 8, padding: 12 },
  botActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 8, borderWidth: 1 },
  modalOverlay: { flex: 1, backgroundColor: "#000000cc", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 36, height: 4, backgroundColor: "#ffffff30", borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 20 },
  fieldLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 8 },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  input: { borderWidth: 1, borderRadius: 10, padding: 13, fontSize: 15, marginBottom: 16 },
  rangeRow: { flexDirection: "row", gap: 10 },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
});
