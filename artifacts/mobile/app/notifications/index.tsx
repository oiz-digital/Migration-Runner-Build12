import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
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
import { apiFetch, apiPost } from "@/hooks/useApi";
import { EmptyState } from "@/components/EmptyState";

const GREEN = "#0ECB81";
const RED = "#F6465D";
const YELLOW = "#F0B90B";
const PURPLE = "#9945ff";

interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
}

type FilterTab = "all" | "trade" | "security" | "system" | "ai";

const TYPE_CONFIG: Record<string, { icon: keyof typeof Feather.glyphMap; color: string; label: string; category: FilterTab }> = {
  order:      { icon: "check-circle",   color: GREEN,   label: "Order",    category: "trade" },
  trade:      { icon: "repeat",         color: "#eb9100", label: "Trade",  category: "trade" },
  filled:     { icon: "check-square",   color: GREEN,   label: "Filled",   category: "trade" },
  withdrawal: { icon: "arrow-up-circle", color: RED,    label: "Withdraw", category: "trade" },
  deposit:    { icon: "arrow-down-circle", color: GREEN, label: "Deposit", category: "trade" },
  security:   { icon: "shield",         color: YELLOW,  label: "Security", category: "security" },
  login:      { icon: "log-in",         color: YELLOW,  label: "Login",    category: "security" },
  "2fa":      { icon: "key",            color: YELLOW,  label: "2FA",      category: "security" },
  kyc:        { icon: "user-check",     color: "#627eea", label: "KYC",    category: "system" },
  system:     { icon: "info",           color: "#848E9C", label: "System", category: "system" },
  announcement: { icon: "bell",         color: "#627eea", label: "News",  category: "system" },
  ai:         { icon: "cpu",            color: PURPLE,  label: "AI",       category: "ai" },
  bot:        { icon: "grid",           color: "#eb9100", label: "Bot",    category: "ai" },
};

const DEFAULT_CONFIG = { icon: "bell" as const, color: "#848E9C", label: "Update", category: "system" as FilterTab };

const FILTER_TABS: { key: FilterTab; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: "all",      label: "All",      icon: "bell" },
  { key: "trade",    label: "Trading",  icon: "repeat" },
  { key: "security", label: "Security", icon: "shield" },
  { key: "system",   label: "System",   icon: "info" },
  { key: "ai",       label: "AI & Bots", icon: "cpu" },
];

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function groupByDate(items: Notification[]): Array<{ title: string; data: Notification[] }> {
  const groups: Record<string, Notification[]> = {};
  const now = Date.now();
  for (const n of items) {
    const diff = Math.floor((now - new Date(n.createdAt).getTime()) / 86400000);
    const key = diff === 0 ? "Today" : diff === 1 ? "Yesterday" : `${diff} days ago`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(n);
  }
  return Object.entries(groups).map(([title, data]) => ({ title, data }));
}

// Fallback demo notifications when API has none
const DEMO_NOTIFICATIONS: Notification[] = [
  { id: 1, title: "Welcome to Zebvix! 🎉", message: "Your account is set up. Complete KYC to unlock all features.", type: "system", read: false, createdAt: new Date(Date.now() - 300000).toISOString() },
  { id: 2, title: "AI Trading Plans Available", message: "Explore AI-powered trading plans with returns up to 28% monthly.", type: "ai", read: false, createdAt: new Date(Date.now() - 3600000).toISOString() },
  { id: 3, title: "Referral Bonus Waiting", message: "Invite friends and earn 30% commission on every trade they make.", type: "system", read: true, createdAt: new Date(Date.now() - 86400000).toISOString() },
  { id: 4, title: "New Futures Pairs Added", message: "BTCPERP, ETHPERP, SOLPERP now available with up to 100× leverage.", type: "trade", read: true, createdAt: new Date(Date.now() - 172800000).toISOString() },
  { id: 5, title: "Security Reminder", message: "Enable 2FA to secure your account. Go to Settings → Security.", type: "security", read: true, createdAt: new Date(Date.now() - 259200000).toISOString() },
];

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [filterTab, setFilterTab] = useState<FilterTab>("all");

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiFetch<Notification[]>("/api/notifications/me"),
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  });

  const markAllMutation = useMutation({
    mutationFn: () => apiPost("/api/notifications/read-all", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const notifications = isAuthenticated ? (data ?? []) : DEMO_NOTIFICATIONS;

  const filtered = useMemo(() => {
    if (filterTab === "all") return notifications;
    return notifications.filter(n => {
      const cfg = TYPE_CONFIG[n.type] ?? DEFAULT_CONFIG;
      return cfg.category === filterTab;
    });
  }, [notifications, filterTab]);

  const unreadCount = notifications.filter(n => !n.read).length;
  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  // Flatten for FlatList with section headers
  const flatData: Array<{ type: "header"; title: string } | { type: "item"; item: Notification }> = useMemo(() => {
    const result: Array<{ type: "header"; title: string } | { type: "item"; item: Notification }> = [];
    for (const group of groups) {
      result.push({ type: "header", title: group.title });
      for (const item of group.data) {
        result.push({ type: "item", item });
      }
    }
    return result;
  }, [groups]);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient colors={["#141C1E", colors.card]} style={[s.header, { paddingTop: topPt, borderBottomColor: colors.border }]}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Text style={[s.title, { color: colors.foreground }]}>Notifications</Text>
            {unreadCount > 0 && (
              <View style={[s.unreadBadge, { backgroundColor: GREEN }]}>
                <Text style={s.unreadBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>
          {unreadCount > 0 ? (
            <TouchableOpacity
              style={[s.markAllBtn, { backgroundColor: GREEN + "22", borderColor: GREEN + "44" }]}
              onPress={() => markAllMutation.mutate()}
            >
              <Feather name="check-circle" size={13} color={GREEN} />
              <Text style={[s.markAllText, { color: GREEN }]}>Mark all</Text>
            </TouchableOpacity>
          ) : <View style={{ width: 80 }} />}
        </View>

        {/* Filter tabs */}
        <View style={s.filterRow}>
          {FILTER_TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[s.filterBtn, filterTab === tab.key && { backgroundColor: GREEN + "22", borderColor: GREEN + "66", borderWidth: 1 }]}
              onPress={() => setFilterTab(tab.key)}
            >
              <Feather name={tab.icon} size={11} color={filterTab === tab.key ? GREEN : "#848E9C"} />
              <Text style={[s.filterLabel, { color: filterTab === tab.key ? GREEN : "#848E9C" }]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {/* List */}
      <FlatList
        data={flatData}
        keyExtractor={(item, i) => item.type === "header" ? `h-${item.title}` : `n-${item.item.id}`}
        contentContainerStyle={{ paddingBottom: botPt + 20, flexGrow: 1 }}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={() => void refetch()} tintColor={GREEN} />
        }
        renderItem={({ item: row }) => {
          if (row.type === "header") {
            return (
              <View style={[s.sectionHeader, { borderBottomColor: colors.border }]}>
                <Text style={[s.sectionTitle, { color: "#848E9C" }]}>{row.title}</Text>
              </View>
            );
          }
          const n = row.item;
          const cfg = TYPE_CONFIG[n.type] ?? DEFAULT_CONFIG;
          return (
            <TouchableOpacity
              style={[s.notifCard, { backgroundColor: n.read ? "transparent" : cfg.color + "08", borderBottomColor: colors.border }]}
              activeOpacity={0.7}
            >
              {!n.read && <View style={[s.unreadDot, { backgroundColor: cfg.color }]} />}
              <View style={[s.notifIcon, { backgroundColor: cfg.color + "20" }]}>
                <Feather name={cfg.icon} size={18} color={cfg.color} />
              </View>
              <View style={s.notifContent}>
                <View style={s.notifTopRow}>
                  <Text style={[s.notifTitle, { color: colors.foreground }]} numberOfLines={1}>{n.title}</Text>
                  <Text style={[s.notifTime, { color: "#848E9C" }]}>{timeAgo(n.createdAt)}</Text>
                </View>
                <Text style={[s.notifMsg, { color: "#848E9C" }]} numberOfLines={2}>{n.message}</Text>
                <View style={[s.notifTypePill, { backgroundColor: cfg.color + "18" }]}>
                  <Text style={[s.notifTypeText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState icon="bell" title="All Caught Up!" subtitle={filterTab === "all" ? "No new notifications" : `No ${filterTab} notifications`} />
          ) : null
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { borderBottomWidth: StyleSheet.hairlineWidth },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingBottom: 12, gap: 8 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 20, fontWeight: "800" },
  unreadBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, minWidth: 22, alignItems: "center" },
  unreadBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  markAllBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  markAllText: { fontSize: 12, fontWeight: "700" },
  filterRow: { flexDirection: "row", gap: 6, paddingHorizontal: 14, paddingBottom: 12, flexWrap: "nowrap" },
  filterBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: "transparent" },
  filterLabel: { fontSize: 11, fontWeight: "600" },
  sectionHeader: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  sectionTitle: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  notifCard: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12, position: "relative" },
  unreadDot: { position: "absolute", left: 5, top: 18, width: 6, height: 6, borderRadius: 3 },
  notifIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  notifContent: { flex: 1, gap: 3 },
  notifTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  notifTitle: { fontSize: 14, fontWeight: "700", flex: 1, marginRight: 8 },
  notifTime: { fontSize: 11, flexShrink: 0 },
  notifMsg: { fontSize: 13, lineHeight: 18 },
  notifTypePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, alignSelf: "flex-start", marginTop: 2 },
  notifTypeText: { fontSize: 10, fontWeight: "700" },
});
