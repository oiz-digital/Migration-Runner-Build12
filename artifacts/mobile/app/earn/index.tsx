import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
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
import { apiFetch, apiPost } from "@/hooks/useApi";
import { EmptyState } from "@/components/EmptyState";

interface EarnPool {
  id: number;
  name: string;
  coinSymbol: string;
  apy: string;
  minAmount: string;
  maxAmount: string;
  duration: number;
  totalStaked: string;
  status: string;
  flexible: boolean;
}

interface EarnPos {
  id: number;
  pool: EarnPool;
  amount: string;
  earnings: string;
  startDate: string;
  status: string;
}

type Tab = "explore" | "mine";
type Filter = "all" | "flexible" | "fixed";

const COIN_COLORS: Record<string, string> = {
  BTC: "#f7931a", ETH: "#627eea", USDT: "#26a17b", BNB: "#f3ba2f",
  SOL: "#9945ff", ADA: "#3cc8c8", MATIC: "#8247e5", DEFAULT: "#eb9100",
};

function getApyColor(apy: number): string {
  if (apy >= 30) return "#ef4444";
  if (apy >= 15) return "#f59e0b";
  return "#22c55e";
}

export default function EarnScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState<Tab>("explore");
  const [filter, setFilter] = useState<Filter>("all");
  const [modal, setModal] = useState<EarnPool | null>(null);
  const [stakeAmt, setStakeAmt] = useState("");

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const { data: pools, isLoading } = useQuery({
    queryKey: ["earn-pools"],
    queryFn: () => apiFetch<{ items: EarnPool[] } | EarnPool[]>("/api/staking/pool").then(r => Array.isArray(r) ? r : (r as any)?.items ?? []),
    staleTime: 60_000,
  });

  const { data: myPositions } = useQuery({
    queryKey: ["earn-positions"],
    queryFn: () => apiFetch<{ items: EarnPos[] } | EarnPos[]>("/api/staking/position").then(r => Array.isArray(r) ? r : (r as any)?.items ?? []),
    enabled: isAuthenticated,
  });

  const stakeMutation = useMutation({
    mutationFn: (body: object) => apiPost("/api/staking/position", body),
    onSuccess: () => {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModal(null);
      setStakeAmt("");
      void qc.invalidateQueries({ queryKey: ["earn-positions"] });
    },
  });

  type Pool = NonNullable<typeof pools>[number];
  type Pos = NonNullable<typeof myPositions>[number];
  const activePools = (pools ?? []).filter((p: Pool) => p.status === "active" || !p.status);
  const filteredPools = filter === "all" ? activePools : activePools.filter((p: Pool) => filter === "flexible" ? p.flexible : !p.flexible);

  const totalEarnings = (myPositions ?? []).reduce((s: number, p: Pos) => s + parseFloat(p.earnings || "0"), 0);
  const totalStakedAmt = (myPositions ?? []).reduce((s: number, p: Pos) => s + parseFloat(p.amount || "0"), 0);
  const maxApy = activePools.length > 0 ? Math.max(...activePools.map((p: Pool) => parseFloat(p.apy || "0"))) : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Earn / Staking</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Hero banner */}
      <LinearGradient colors={["#0a1a0e", "#0d1524"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>Earn Up to {maxApy.toFixed(1)}% APY</Text>
          <Text style={styles.heroSub}>Stake crypto, earn daily rewards. No lock-up on flexible plans.</Text>
          {isAuthenticated && totalStakedAmt > 0 && (
            <View style={styles.earnStats}>
              <View style={styles.earnChip}>
                <Feather name="lock" size={10} color={colors.primary} />
                <Text style={[styles.earnChipText, { color: colors.primary }]}>${totalStakedAmt.toFixed(2)} staked</Text>
              </View>
              <View style={styles.earnChip}>
                <Feather name="gift" size={10} color="#22c55e" />
                <Text style={[styles.earnChipText, { color: "#22c55e" }]}>+${totalEarnings.toFixed(4)} earned</Text>
              </View>
            </View>
          )}
        </View>
        <View style={[styles.heroIcon, { backgroundColor: "#22c55e20" }]}>
          <Feather name="percent" size={28} color="#22c55e" />
        </View>
      </LinearGradient>

      {/* Tabs */}
      <View style={[styles.tabRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(["explore", "mine"] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, t === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}
          >
            <Feather name={t === "explore" ? "search" : "layers"} size={14} color={t === tab ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.tabLabel, { color: t === tab ? colors.primary : colors.mutedForeground }]}>
              {t === "explore" ? "Explore Plans" : "My Positions"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "explore" && (
        <>
          {/* Filter chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10 }}>
            {(["all", "flexible", "fixed"] as Filter[]).map((f) => (
              <TouchableOpacity
                key={f}
                onPress={() => setFilter(f)}
                style={[styles.filterChip, { backgroundColor: filter === f ? colors.primary : colors.card, borderColor: filter === f ? colors.primary : colors.border }]}
              >
                <Text style={[styles.filterChipText, { color: filter === f ? "#fff" : colors.mutedForeground }]}>
                  {f === "all" ? "All Plans" : f === "flexible" ? "⚡ Flexible" : "🔒 Fixed"}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {isLoading ? (
            <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
          ) : filteredPools.length === 0 ? (
            <EmptyState icon="percent" title="No plans available" subtitle="Staking plans coming soon" />
          ) : (
            <FlatList
              data={filteredPools}
              keyExtractor={(p) => p.id.toString()}
              contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12, paddingBottom: botPt + 20 }}
              renderItem={({ item: pool }) => {
                const coinColor = COIN_COLORS[pool.coinSymbol] ?? COIN_COLORS.DEFAULT;
                const apy = parseFloat(pool.apy || "0");
                const apyColor = getApyColor(apy);
                const staked = parseFloat(pool.totalStaked || "0");
                return (
                  <TouchableOpacity
                    style={[styles.poolCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => { setModal(pool); setStakeAmt(""); }}
                    activeOpacity={0.8}
                  >
                    <LinearGradient colors={[coinColor + "08", "transparent"]} style={StyleSheet.absoluteFillObject} />
                    <View style={styles.poolTop}>
                      <View style={[styles.coinCircle, { backgroundColor: coinColor + "25" }]}>
                        <Text style={[styles.coinText, { color: coinColor }]}>{pool.coinSymbol.slice(0, 3)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.poolNameRow}>
                          <Text style={[styles.poolName, { color: colors.foreground }]}>{pool.name}</Text>
                          {pool.flexible && (
                            <View style={[styles.flexBadge, { backgroundColor: "#22c55e15" }]}>
                              <Text style={{ color: "#22c55e", fontSize: 10, fontWeight: "700" }}>FLEXIBLE</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.poolCoin, { color: colors.mutedForeground }]}>
                          {pool.coinSymbol} · {pool.duration === 0 ? "No lockup" : `${pool.duration}d lock`}
                        </Text>
                      </View>
                      <View style={styles.apyWrap}>
                        <Text style={[styles.apyVal, { color: apyColor }]}>{apy.toFixed(1)}%</Text>
                        <Text style={[styles.apyLbl, { color: colors.mutedForeground }]}>APY</Text>
                      </View>
                    </View>

                    <View style={[styles.poolSep, { backgroundColor: colors.border }]} />

                    <View style={styles.poolStats}>
                      <View style={styles.poolStat}>
                        <Text style={[styles.poolStatVal, { color: colors.foreground }]}>
                          {parseFloat(pool.minAmount).toFixed(0)} {pool.coinSymbol}
                        </Text>
                        <Text style={[styles.poolStatLbl, { color: colors.mutedForeground }]}>Min Stake</Text>
                      </View>
                      <View style={styles.poolStat}>
                        <Text style={[styles.poolStatVal, { color: colors.foreground }]}>
                          ${staked > 0 ? (staked / 1000).toFixed(1) + "K" : "0"}
                        </Text>
                        <Text style={[styles.poolStatLbl, { color: colors.mutedForeground }]}>Total Staked</Text>
                      </View>
                      <View style={styles.poolStat}>
                        <Text style={[styles.poolStatVal, { color: colors.foreground }]}>Daily</Text>
                        <Text style={[styles.poolStatLbl, { color: colors.mutedForeground }]}>Rewards</Text>
                      </View>
                    </View>

                    {/* APY calculator preview */}
                    <View style={[styles.calcPreview, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                      <Feather name="percent" size={12} color={colors.mutedForeground} />
                      <Text style={[styles.calcText, { color: colors.mutedForeground }]}>
                        1,000 {pool.coinSymbol} → earn ~{((1000 * apy) / 100 / 12).toFixed(2)} {pool.coinSymbol}/mo
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[styles.stakeBtn, { backgroundColor: coinColor }]}
                      onPress={() => {
                        if (!isAuthenticated) { router.push("/login"); return; }
                        setModal(pool); setStakeAmt("");
                      }}
                    >
                      <Feather name="plus" size={14} color="#fff" />
                      <Text style={styles.stakeBtnLabel}>Stake {pool.coinSymbol}</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </>
      )}

      {tab === "mine" && (
        <FlatList
          data={myPositions ?? []}
          keyExtractor={(p) => p.id.toString()}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: botPt + 20, flexGrow: 1 }}
          ListEmptyComponent={
            !isAuthenticated
              ? <EmptyState icon="lock" title="Login required" />
              : <EmptyState icon="percent" title="No positions yet" subtitle="Stake crypto to start earning" />
          }
          ListHeaderComponent={
            (myPositions ?? []).length > 0 && isAuthenticated ? (
              <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <LinearGradient colors={["#22c55e10", "transparent"]} style={StyleSheet.absoluteFillObject} />
                <View style={styles.summaryRow}>
                  {[
                    { label: "Total Staked", value: `$${totalStakedAmt.toFixed(2)}`, color: colors.foreground },
                    { label: "Total Earned", value: `+$${totalEarnings.toFixed(4)}`, color: colors.success },
                  ].map((s) => (
                    <View key={s.label} style={styles.summaryItem}>
                      <Text style={[styles.summaryVal, { color: s.color }]}>{s.value}</Text>
                      <Text style={[styles.summaryLbl, { color: colors.mutedForeground }]}>{s.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null
          }
          renderItem={({ item: pos }) => {
            const coinColor = COIN_COLORS[pos.pool?.coinSymbol ?? ""] ?? COIN_COLORS.DEFAULT;
            const earnings = parseFloat(pos.earnings || "0");
            const amt = parseFloat(pos.amount || "0");
            return (
              <View style={[styles.posCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <LinearGradient colors={[coinColor + "08", "transparent"]} style={StyleSheet.absoluteFillObject} />
                <View style={styles.posTop}>
                  <View style={[styles.coinCircle, { backgroundColor: coinColor + "25" }]}>
                    <Text style={[styles.coinText, { color: coinColor }]}>{(pos.pool?.coinSymbol ?? "?").slice(0, 3)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.poolName, { color: colors.foreground }]}>{pos.pool?.name ?? "Pool"}</Text>
                    <Text style={[styles.poolCoin, { color: colors.mutedForeground }]}>${amt.toFixed(4)} staked</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.posEarnings, { color: colors.success }]}>+${earnings.toFixed(4)}</Text>
                    <Text style={[styles.poolStatLbl, { color: colors.mutedForeground }]}>earned</Text>
                  </View>
                </View>
                <View style={styles.posMeta}>
                  <View style={[styles.statusBadge, { backgroundColor: pos.status === "active" ? "#22c55e20" : colors.muted }]}>
                    <View style={[styles.statusDot, { backgroundColor: pos.status === "active" ? colors.success : colors.mutedForeground }]} />
                    <Text style={[styles.statusText, { color: pos.status === "active" ? colors.success : colors.mutedForeground }]}>
                      {pos.status}
                    </Text>
                  </View>
                  <Text style={[styles.poolStatLbl, { color: colors.mutedForeground }]}>
                    Since {new Date(pos.startDate).toLocaleDateString("en-IN")}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Stake Modal */}
      <Modal visible={!!modal} transparent animationType="slide" onRequestClose={() => setModal(null)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setModal(null)}>
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Stake {modal?.coinSymbol}</Text>
              <TouchableOpacity onPress={() => setModal(null)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            {modal && (
              <View style={{ padding: 20, gap: 14 }}>
                {/* Plan summary */}
                <View style={{ gap: 8 }}>
                  {[
                    { label: "APY", value: `${parseFloat(modal.apy).toFixed(1)}%`, color: getApyColor(parseFloat(modal.apy)) },
                    { label: "Duration", value: modal.duration === 0 ? "Flexible (no lockup)" : `${modal.duration} days` },
                    { label: "Min Stake", value: `${parseFloat(modal.minAmount).toFixed(0)} ${modal.coinSymbol}` },
                  ].map((r) => (
                    <View key={r.label} style={[styles.infoRow, { backgroundColor: colors.muted }]}>
                      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{r.label}</Text>
                      <Text style={[styles.infoVal, { color: (r as any).color ?? colors.foreground }]}>{r.value}</Text>
                    </View>
                  ))}
                </View>

                {/* Amount input */}
                <View>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Amount to Stake</Text>
                  <View style={[styles.amtWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                    <TextInput
                      style={[styles.amtInput, { color: colors.foreground }]}
                      value={stakeAmt}
                      onChangeText={setStakeAmt}
                      placeholder={`Min ${parseFloat(modal.minAmount).toFixed(0)}`}
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="decimal-pad"
                      autoFocus
                    />
                    <TouchableOpacity onPress={() => setStakeAmt(modal.maxAmount)}>
                      <Text style={[styles.maxBtn, { color: colors.primary }]}>MAX</Text>
                    </TouchableOpacity>
                    <Text style={[styles.amtUnit, { color: colors.primary }]}>{modal.coinSymbol}</Text>
                  </View>
                </View>

                {/* Projected earnings */}
                {stakeAmt && parseFloat(stakeAmt) > 0 && (
                  <View style={[styles.projectedCard, { backgroundColor: colors.success + "12", borderColor: colors.success + "30" }]}>
                    <Feather name="trending-up" size={14} color={colors.success} />
                    <Text style={[styles.projectedText, { color: colors.success }]}>
                      Projected earnings: ~{((parseFloat(stakeAmt) * parseFloat(modal.apy)) / 100 / 365 * (modal.duration || 365)).toFixed(4)} {modal.coinSymbol}
                    </Text>
                  </View>
                )}

                {stakeMutation.isError && (
                  <Text style={{ color: colors.destructive, fontSize: 12 }}>{(stakeMutation.error as Error).message}</Text>
                )}

                <TouchableOpacity
                  style={[styles.stakeBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    if (!stakeAmt || parseFloat(stakeAmt) <= 0) return;
                    stakeMutation.mutate({ poolId: modal.id, amount: parseFloat(stakeAmt) });
                  }}
                  disabled={stakeMutation.isPending}
                >
                  {stakeMutation.isPending
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <>
                        <Feather name="lock" size={14} color="#fff" />
                        <Text style={styles.stakeBtnLabel}>Confirm Stake</Text>
                      </>}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "700", textAlign: "center" },
  hero: { flexDirection: "row", alignItems: "center", margin: 16, padding: 18, borderRadius: 16, gap: 16 },
  heroTitle: { color: "#f8fafc", fontSize: 16, fontWeight: "800" },
  heroSub: { color: "#6b7a9e", fontSize: 12, marginTop: 4, lineHeight: 16 },
  earnStats: { flexDirection: "row", gap: 8, marginTop: 8 },
  earnChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.07)" },
  earnChipText: { fontSize: 11, fontWeight: "700" },
  heroIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  tabRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 11, gap: 5, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabLabel: { fontSize: 13, fontWeight: "700" },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  filterChipText: { fontSize: 13, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  poolCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  poolTop: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  coinCircle: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  coinText: { fontSize: 13, fontWeight: "800" },
  poolNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  poolName: { fontSize: 15, fontWeight: "700" },
  flexBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  poolCoin: { fontSize: 12, marginTop: 2 },
  apyWrap: { alignItems: "center" },
  apyVal: { fontSize: 22, fontWeight: "900" },
  apyLbl: { fontSize: 11, marginTop: 1 },
  poolSep: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  poolStats: { flexDirection: "row", paddingHorizontal: 14, paddingVertical: 10 },
  poolStat: { flex: 1, alignItems: "center" },
  poolStatVal: { fontSize: 13, fontWeight: "700" },
  poolStatLbl: { fontSize: 10, marginTop: 2 },
  calcPreview: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 14, marginBottom: 12, padding: 10, borderRadius: 8, borderWidth: 1 },
  calcText: { fontSize: 12 },
  stakeBtn: { margin: 14, marginTop: 0, height: 44, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  stakeBtnLabel: { color: "#fff", fontSize: 14, fontWeight: "800" },
  summaryCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 12, overflow: "hidden" },
  summaryRow: { flexDirection: "row" },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryVal: { fontSize: 18, fontWeight: "800" },
  summaryLbl: { fontSize: 12, marginTop: 3 },
  posCard: { borderRadius: 12, borderWidth: 1, padding: 14, overflow: "hidden" },
  posTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  posEarnings: { fontSize: 15, fontWeight: "800" },
  posMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 16, fontWeight: "700" },
  infoRow: { flexDirection: "row", justifyContent: "space-between", padding: 12, borderRadius: 8 },
  infoLabel: { fontSize: 14 },
  infoVal: { fontSize: 14, fontWeight: "700" },
  fieldLabel: { fontSize: 12, marginBottom: 6 },
  amtWrap: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, height: 48, gap: 8 },
  amtInput: { flex: 1, fontSize: 18, fontWeight: "700" },
  maxBtn: { fontSize: 12, fontWeight: "800" },
  amtUnit: { fontSize: 14, fontWeight: "700" },
  projectedCard: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 8, borderWidth: 1 },
  projectedText: { fontSize: 13, fontWeight: "600" },
});
