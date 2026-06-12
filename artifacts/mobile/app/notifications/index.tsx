import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
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
import { useQuery } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/hooks/useApi";
import { EmptyState } from "@/components/EmptyState";

interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
}

const TYPE_ICONS: Record<string, { icon: keyof typeof Feather.glyphMap; color: string }> = {
  order: { icon: "check-circle", color: "#22c55e" },
  trade: { icon: "repeat", color: "#eb9100" },
  withdrawal: { icon: "arrow-up-circle", color: "#e81515" },
  deposit: { icon: "arrow-down-circle", color: "#22c55e" },
  security: { icon: "shield", color: "#f59e0b" },
  system: { icon: "info", color: "#6b7a9e" },
  kyc: { icon: "user-check", color: "#346aa9" },
  ai: { icon: "cpu", color: "#9945ff" },
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiFetch<Notification[]>("/api/notifications/me"),
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Notifications</Text>
        <View style={styles.backBtn} />
      </View>

      {!isAuthenticated ? (
        <EmptyState icon="bell" title="Login required" subtitle="Sign in to see your notifications" />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(n) => n.id.toString()}
          contentContainerStyle={{ paddingBottom: botPt + 20, flexGrow: 1 }}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={() => void refetch()} tintColor={colors.primary} />
          }
          renderItem={({ item: n }) => {
            const iconInfo = TYPE_ICONS[n.type] ?? TYPE_ICONS.system;
            return (
              <View style={[styles.notifRow, { borderBottomColor: colors.border, backgroundColor: n.read ? "transparent" : colors.primary + "08" }]}>
                {!n.read && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
                <View style={[styles.notifIcon, { backgroundColor: iconInfo.color + "20" }]}>
                  <Feather name={iconInfo.icon} size={18} color={iconInfo.color} />
                </View>
                <View style={styles.notifContent}>
                  <Text style={[styles.notifTitle, { color: colors.foreground }]} numberOfLines={1}>{n.title}</Text>
                  <Text style={[styles.notifMsg, { color: colors.mutedForeground }]} numberOfLines={2}>{n.message}</Text>
                  <Text style={[styles.notifTime, { color: colors.mutedForeground }]}>{timeAgo(n.createdAt)}</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            !isLoading ? (
              <EmptyState icon="bell" title="All caught up!" subtitle="No new notifications" />
            ) : null
          }
        />
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
  notifRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
    position: "relative",
  },
  unreadDot: {
    position: "absolute",
    left: 6,
    top: 18,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  notifIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  notifContent: { flex: 1 },
  notifTitle: { fontSize: 14, fontWeight: "700", marginBottom: 3 },
  notifMsg: { fontSize: 13, lineHeight: 18, marginBottom: 5 },
  notifTime: { fontSize: 11 },
});
