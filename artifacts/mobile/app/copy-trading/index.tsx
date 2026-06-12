import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/hooks/useApi";
import { EmptyState } from "@/components/EmptyState";
import { SparkLine } from "@/components/SparkLine";

interface Trader {
  id: number;
  userId: number;
  user: { name: string; handle?: string; avatar?: string };
  roi30d: string;
  roi90d: string;
  winRate: string;
  totalFollowers: number;
  aum: string;
  maxDrawdown: string;
  totalTrades: number;
  profitFactor?: string;
  verified?: boolean;
}

interface MyCopy {
  id: number;
  trader: { user: { name: string } };
  allocatedAmount: string;
  pnl: string;
  status: string;
}

type Tab = "discover" | "following";

function genROISpark(roi: number, n = 20): number[] {
  let seed = Math.abs(roi * 100 + 42) | 0;
  const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const pts: number[] = [100];
  for (let i = 1; i < n; i++) {
    const prev = pts[i - 1];
    const trend = roi / n;
    const noise = (rng() - 0.45) * 2;
    pts.push(Math.max(prev + trend + noise, 50));
  }
  return pts;
}

export default function CopyTradingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState<Tab>("discover");

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const { data: traders, isLoading } = useQuery({
    queryKey: ["copy-traders"],
    queryFn: () => apiFetch<Trader[]>("/api/copy-trading/traders"),
    staleTime: 60_000,
  });

  const { data: myCopies } = useQuery({
    queryKey: ["my-copies"],
    queryFn: () => apiFetch<MyCopy[]>("/api/copy-trading/positions"),
    enabled: isAuthenticated,
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Copy Trading</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Hero */}
      <LinearGradient
        colors={["#0f0520", "#0d1524"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { borderColor: colors.border }]}
      >
        <View style={styles.heroLeft}>
          <Text style={styles.heroTitle}>Copy Expert Traders</Text>
          <Text style={styles.heroSub}>Auto-mirror top-performing strategies in real time</Text>
        </View>
        <View style={[styles.heroIcon, { backgroundColor: "#9945ff30" }]}>
          <Feather name="copy" size={30} color="#9945ff" />
        </View>
      </LinearGradient>

      {/* Tabs */}
      <View style={[styles.tabRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(["discover", "following"] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, t === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabLabel, { color: t === tab ? colors.primary : colors.mutedForeground }]}>
              {t === "discover" ? "Discover" : "My Copies"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "discover" ? (
        <FlatList
          data={traders ?? []}
          keyExtractor={(t) => t.id.toString()}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: botPt + 20, flexGrow: 1 }}
          ListEmptyComponent={
            isLoading
              ? <EmptyState icon="loader" title="Loading traders..." />
              : <EmptyState icon="users" title="No traders available" subtitle="Check back soon" />
          }
          renderItem={({ item: t }) => {
            const roi30 = parseFloat(t.roi30d) || 0;
            const roi90 = parseFloat(t.roi90d) || 0;
            const winRate = parseFloat(t.winRate) || 0;
            const spark = genROISpark(roi90);
            return (
              <View style={[styles.traderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.traderTop}>
                  <View style={[styles.traderAvatar, { backgroundColor: colors.primary + "20" }]}>
                    <Text style={[styles.traderAvatarText, { color: colors.primary }]}>
                      {t.user.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.traderInfo}>
                    <View style={styles.traderNameRow}>
                      <Text style={[styles.traderName, { color: colors.foreground }]}>{t.user.name}</Text>
                      {t.verified && (
                        <View style={[styles.verifiedBadge, { backgroundColor: colors.primary + "20" }]}>
                          <Feather name="check-circle" size={10} color={colors.primary} />
                          <Text style={[styles.verifiedText, { color: colors.primary }]}>PRO</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.traderHandle, { color: colors.mutedForeground }]}>
                      {t.user.handle ?? `@trader${t.userId}`} • {t.totalFollowers} followers
                    </Text>
                  </View>
                  <SparkLine data={spark} width={64} height={36} positive={roi90 >= 0} id={`ct${t.id}`} />
                </View>

                <View style={[styles.traderDivider, { backgroundColor: colors.border }]} />

                <View style={styles.traderStats}>
                  <View style={styles.traderStat}>
                    <Text style={[styles.traderStatVal, { color: roi30 >= 0 ? colors.success : colors.destructive }]}>
                      {roi30 >= 0 ? "+" : ""}{roi30.toFixed(1)}%
                    </Text>
                    <Text style={[styles.traderStatLbl, { color: colors.mutedForeground }]}>30d ROI</Text>
                  </View>
                  <View style={[styles.traderStatSep, { backgroundColor: colors.border }]} />
                  <View style={styles.traderStat}>
                    <Text style={[styles.traderStatVal, { color: roi90 >= 0 ? colors.success : colors.destructive }]}>
                      {roi90 >= 0 ? "+" : ""}{roi90.toFixed(1)}%
                    </Text>
                    <Text style={[styles.traderStatLbl, { color: colors.mutedForeground }]}>90d ROI</Text>
                  </View>
                  <View style={[styles.traderStatSep, { backgroundColor: colors.border }]} />
                  <View style={styles.traderStat}>
                    <Text style={[styles.traderStatVal, { color: colors.foreground }]}>{winRate.toFixed(0)}%</Text>
                    <Text style={[styles.traderStatLbl, { color: colors.mutedForeground }]}>Win Rate</Text>
                  </View>
                  <View style={[styles.traderStatSep, { backgroundColor: colors.border }]} />
                  <View style={styles.traderStat}>
                    <Text style={[styles.traderStatVal, { color: colors.foreground }]}>
                      ${parseFloat(t.aum ?? "0").toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </Text>
                    <Text style={[styles.traderStatLbl, { color: colors.mutedForeground }]}>AUM</Text>
                  </View>
                </View>

                <View style={styles.traderFooter}>
                  <View style={styles.traderBadges}>
                    <View style={[styles.badge, { backgroundColor: colors.muted }]}>
                      <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>
                        DD: {parseFloat(t.maxDrawdown ?? "0").toFixed(1)}%
                      </Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: colors.muted }]}>
                      <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>
                        {t.totalTrades} trades
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.followBtn, { backgroundColor: colors.primary }]}
                    onPress={() => !isAuthenticated && router.push("/login")}
                  >
                    <Feather name="plus" size={13} color="#fff" />
                    <Text style={styles.followBtnLabel}>
                      {isAuthenticated ? "Copy" : "Login"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: botPt + 20, flexGrow: 1 }}>
          {!isAuthenticated ? (
            <View style={{ flex: 1, paddingTop: 60 }}>
              <EmptyState icon="lock" title="Login required" subtitle="Sign in to see your copy trading portfolio" />
            </View>
          ) : (myCopies ?? []).length === 0 ? (
            <EmptyState icon="copy" title="No active copies" subtitle="Discover traders above and start copying" />
          ) : (
            (myCopies ?? []).map((c) => {
              const pnl = parseFloat(c.pnl ?? "0");
              return (
                <View key={c.id} style={[styles.copyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.copyCardRow}>
                    <View>
                      <Text style={[styles.copyTraderName, { color: colors.foreground }]}>{c.trader.user.name}</Text>
                      <Text style={[styles.copyAlloc, { color: colors.mutedForeground }]}>
                        Allocated: ${parseFloat(c.allocatedAmount).toFixed(2)}
                      </Text>
                    </View>
                    <View style={styles.copyRight}>
                      <Text style={[styles.copyPnl, { color: pnl >= 0 ? colors.success : colors.destructive }]}>
                        {pnl >= 0 ? "+" : ""}${Math.abs(pnl).toFixed(2)}
                      </Text>
                      <Text style={[styles.copyStatus, { color: colors.mutedForeground }]}>{c.status}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "700", textAlign: "center" },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    gap: 16,
  },
  heroLeft: { flex: 1 },
  heroTitle: { color: "#f8fafc", fontSize: 16, fontWeight: "800" },
  heroSub: { color: "#6b7a9e", fontSize: 12, marginTop: 4, lineHeight: 16 },
  heroIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  tabRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabLabel: { fontSize: 15, fontWeight: "700" },
  traderCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  traderTop: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  traderAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  traderAvatarText: { fontSize: 20, fontWeight: "800" },
  traderInfo: { flex: 1 },
  traderNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  traderName: { fontSize: 15, fontWeight: "700" },
  verifiedBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, gap: 3 },
  verifiedText: { fontSize: 10, fontWeight: "700" },
  traderHandle: { fontSize: 12, marginTop: 2 },
  traderDivider: { height: StyleSheet.hairlineWidth },
  traderStats: { flexDirection: "row", paddingVertical: 10 },
  traderStat: { flex: 1, alignItems: "center" },
  traderStatVal: { fontSize: 13, fontWeight: "800" },
  traderStatLbl: { fontSize: 10, marginTop: 2 },
  traderStatSep: { width: StyleSheet.hairlineWidth },
  traderFooter: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingBottom: 12, gap: 8 },
  traderBadges: { flex: 1, flexDirection: "row", gap: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  badgeText: { fontSize: 11 },
  followBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, gap: 4 },
  followBtnLabel: { color: "#fff", fontWeight: "700", fontSize: 13 },
  copyCard: { borderRadius: 12, borderWidth: 1, padding: 14 },
  copyCardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  copyTraderName: { fontSize: 15, fontWeight: "700" },
  copyAlloc: { fontSize: 12, marginTop: 2 },
  copyRight: { alignItems: "flex-end" },
  copyPnl: { fontSize: 16, fontWeight: "800" },
  copyStatus: { fontSize: 11, marginTop: 2, textTransform: "capitalize" },
});
