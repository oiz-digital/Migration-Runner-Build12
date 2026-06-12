import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";

const KYC_LABELS = ["Unverified", "Level 1 — PAN", "Level 2 — Aadhaar", "Level 3 — EDD"];
const KYC_COLORS = ["#F6465D", "#f59e0b", "#0ECB81", "#0ECB81"];
const KYC_ICONS: Array<keyof typeof Feather.glyphMap> = ["alert-circle", "check-circle", "check-circle", "shield"];

interface SettingItem {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value?: string;
  badge?: string;
  badgeColor?: string;
  onPress: () => void;
  danger?: boolean;
  iconColor?: string;
  highlight?: boolean;
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const kycLevel = user?.kycLevel ?? 0;
  const kycColor = KYC_COLORS[kycLevel] ?? KYC_COLORS[0];
  const kycLabel = KYC_LABELS[kycLevel] ?? "Unverified";

  const handleLogout = () => {
    if (Platform.OS === "web") {
      void logout();
    } else {
      Alert.alert("Logout", "Are you sure?", [
        { text: "Cancel", style: "cancel" },
        { text: "Logout", style: "destructive", onPress: () => void logout() },
      ]);
    }
  };

  const nav = (path: string) => () => router.push(path as any);

  const SECTIONS: { title: string; items: SettingItem[] }[] = isAuthenticated
    ? [
        {
          title: "Trading",
          items: [
            { icon: "repeat", label: "Spot Trade", iconColor: "#eb9100", onPress: nav("/trade") },
            { icon: "trending-up", label: "Futures", iconColor: "#9945ff", onPress: nav("/futures") },
            { icon: "activity", label: "Options", iconColor: "#627eea", onPress: nav("/options") },
            { icon: "cpu", label: "AI Trading", iconColor: "#0ECB81", onPress: nav("/ai-trading") },
            { icon: "grid", label: "Trading Bots", iconColor: "#eb9100", onPress: nav("/bots") },
            { icon: "copy", label: "Copy Trading", iconColor: "#e84142", onPress: nav("/copy-trading") },
          ],
        },
        {
          title: "Finance",
          items: [
            { icon: "credit-card", label: "Wallet", iconColor: "#0ECB81", onPress: nav("/wallet") },
            { icon: "percent", label: "Earn & Staking", iconColor: "#f59e0b", onPress: nav("/earn") },
            { icon: "users", label: "P2P Trading", iconColor: "#346aa9", onPress: nav("/p2p") },
            { icon: "arrow-right-circle", label: "Convert", iconColor: "#9945ff", onPress: nav("/convert") },
            { icon: "flag", label: "INR Payments", iconColor: "#ff9933", onPress: nav("/inr-payments") },
            { icon: "file-text", label: "Ledger", iconColor: "#627eea", onPress: nav("/ledger") },
          ],
        },
        {
          title: "Portfolio",
          items: [
            { icon: "pie-chart", label: "Portfolio", iconColor: "#00c08b", onPress: nav("/portfolio") },
            { icon: "list", label: "Orders History", iconColor: "#6b7a9e", onPress: nav("/orders") },
            { icon: "bell", label: "Price Alerts", iconColor: "#F6465D", onPress: nav("/price-alerts") },
            { icon: "globe", label: "Discover Tokens", iconColor: "#627eea", onPress: nav("/discover") },
          ],
        },
        {
          title: "Account",
          items: [
            {
              icon: "shield",
              label: "KYC Verification",
              value: kycLabel,
              badge: kycLevel === 0 ? "Required" : "Verified",
              badgeColor: kycColor,
              iconColor: kycColor,
              onPress: nav("/kyc"),
            },
            {
              icon: "lock",
              label: "Security & 2FA",
              value: user?.twoFaEnabled ? "2FA On" : "2FA Off",
              badge: user?.twoFaEnabled ? undefined : "Enable",
              badgeColor: "#f59e0b",
              iconColor: user?.twoFaEnabled ? "#0ECB81" : "#f59e0b",
              onPress: nav("/settings"),
            },
            {
              icon: "gift",
              label: "Referral Program",
              value: `${user?.referralCount ?? 0} invited`,
              iconColor: "#9945ff",
              onPress: nav("/invite"),
            },
            { icon: "settings", label: "Settings", iconColor: "#6b7a9e", onPress: nav("/settings") },
          ],
        },
        {
          title: "Support & Legal",
          items: [
            { icon: "help-circle", label: "Help & Support", iconColor: "#627eea", onPress: nav("/support") },
            { icon: "bell", label: "Notifications", iconColor: "#0ECB81", onPress: nav("/notifications") },
            { icon: "file-text", label: "Terms of Service", iconColor: "#6b7a9e", onPress: nav("/legal/terms") },
            { icon: "eye", label: "Privacy Policy", iconColor: "#6b7a9e", onPress: nav("/legal/privacy") },
            { icon: "alert-triangle", label: "Risk Disclosure", iconColor: "#f59e0b", onPress: nav("/legal/risk") },
            { icon: "tag", label: "Fee Schedule", iconColor: "#0ECB81", onPress: nav("/legal/fees") },
            { icon: "log-out", label: "Logout", onPress: handleLogout, danger: true },
          ],
        },
      ]
    : [
        {
          title: "Get Started",
          items: [
            { icon: "log-in", label: "Login to your account", iconColor: colors.primary, onPress: nav("/login") },
            { icon: "user-plus", label: "Create Account", iconColor: "#0ECB81", onPress: nav("/register") },
          ],
        },
        {
          title: "Explore",
          items: [
            { icon: "bar-chart-2", label: "Markets", iconColor: colors.primary, onPress: nav("/markets") },
            { icon: "globe", label: "Discover Tokens", iconColor: "#627eea", onPress: nav("/discover") },
          ],
        },
        {
          title: "Info",
          items: [
            { icon: "help-circle", label: "Help & Support", iconColor: "#627eea", onPress: nav("/support") },
            { icon: "file-text", label: "Terms of Service", iconColor: "#6b7a9e", onPress: nav("/legal/terms") },
            { icon: "eye", label: "Privacy Policy", iconColor: "#6b7a9e", onPress: nav("/legal/privacy") },
            { icon: "tag", label: "Fee Schedule", iconColor: "#0ECB81", onPress: nav("/legal/fees") },
          ],
        },
      ];

  const securityScore = isAuthenticated
    ? Math.min(100, (user?.twoFaEnabled ? 40 : 0) + (kycLevel >= 2 ? 40 : kycLevel * 15) + 20)
    : 0;
  const secColor = securityScore >= 80 ? "#0ECB81" : securityScore >= 50 ? "#f59e0b" : "#F6465D";

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topPt, paddingBottom: botPt + 90 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header banner */}
      <LinearGradient
        colors={isAuthenticated ? ["#1a0f00", "#0d1524"] : ["#0d1524", "#080e1a"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.banner, { borderBottomColor: colors.border }]}
      >
        <View style={styles.avatarSection}>
          <View style={[styles.avatarRing, { borderColor: colors.primary + "60" }]}>
            <LinearGradient
              colors={[colors.primary + "40", colors.primary + "10"]}
              style={styles.avatar}
            >
              <Text style={[styles.avatarText, { color: colors.primary }]}>
                {isAuthenticated ? (user?.name?.charAt(0)?.toUpperCase() ?? "U") : "Z"}
              </Text>
            </LinearGradient>
          </View>
          {isAuthenticated ? (
            <>
              <Text style={[styles.userName, { color: colors.foreground }]}>{user?.name ?? "Trader"}</Text>
              <Text style={[styles.userEmail, { color: colors.mutedForeground }]}>{user?.email ?? ""}</Text>
              <View style={[styles.kycBadge, { backgroundColor: kycColor + "22", borderColor: kycColor + "50" }]}>
                <Feather name={KYC_ICONS[kycLevel]} size={11} color={kycColor} />
                <Text style={[styles.kycLabel, { color: kycColor }]}>KYC: {kycLabel}</Text>
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.userName, { color: colors.foreground }]}>Guest</Text>
              <Text style={[styles.userEmail, { color: colors.mutedForeground }]}>Login to access all features</Text>
              <TouchableOpacity
                style={[styles.loginCta, { backgroundColor: colors.primary }]}
                onPress={nav("/login")}
              >
                <Text style={styles.loginCtaLabel}>Login / Sign Up</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {isAuthenticated && (
          <View style={[styles.statsRow, { borderTopColor: colors.border + "80" }]}>
            {[
              { label: "VIP Tier", value: `Tier ${user?.vipTier ?? 0}`, icon: "star" as const, color: "#f59e0b" },
              { label: "Referrals", value: `${user?.referralCount ?? 0}`, icon: "users" as const, color: "#627eea" },
              { label: "2FA", value: user?.twoFaEnabled ? "Enabled" : "Disabled", icon: "lock" as const, color: user?.twoFaEnabled ? "#0ECB81" : "#F6465D" },
            ].map((s) => (
              <View key={s.label} style={styles.statItem}>
                <Feather name={s.icon} size={14} color={s.color} />
                <Text style={[styles.statValue, { color: colors.foreground }]}>{s.value}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
              </View>
            ))}
          </View>
        )}
      </LinearGradient>

      {/* Security score */}
      {isAuthenticated && (
        <TouchableOpacity
          style={[styles.secCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={nav("/settings")}
          activeOpacity={0.8}
        >
          <View style={styles.secTop}>
            <View style={styles.secLeft}>
              <Feather name="shield" size={16} color={secColor} />
              <Text style={[styles.secTitle, { color: colors.foreground }]}>Security Score</Text>
            </View>
            <View style={styles.secRight}>
              <Text style={[styles.secScore, { color: secColor }]}>{securityScore}/100</Text>
              <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
            </View>
          </View>
          <View style={[styles.secTrack, { backgroundColor: colors.muted }]}>
            <View style={[styles.secFill, { width: `${securityScore}%` as any, backgroundColor: secColor }]} />
          </View>
          <Text style={[styles.secHint, { color: colors.mutedForeground }]}>
            {securityScore < 80 ? "Enable 2FA and complete KYC to improve your score" : "Your account is well secured"}
          </Text>
        </TouchableOpacity>
      )}

      {/* Settings sections */}
      {SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{section.title.toUpperCase()}</Text>
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {section.items.map((item, i) => {
              const iconC = item.danger ? "#F6465D" : (item.iconColor ?? colors.primary);
              return (
                <React.Fragment key={item.label}>
                  <TouchableOpacity style={styles.settingRow} onPress={item.onPress} activeOpacity={0.7}>
                    <View style={[styles.settingIcon, { backgroundColor: iconC + "18" }]}>
                      <Feather name={item.icon} size={17} color={iconC} />
                    </View>
                    <Text style={[styles.settingLabel, { color: item.danger ? "#F6465D" : colors.foreground }]} numberOfLines={1}>
                      {item.label}
                    </Text>
                    <View style={styles.settingRight}>
                      {item.badge && (
                        <View style={[styles.badge, { backgroundColor: (item.badgeColor ?? colors.primary) + "22" }]}>
                          <Text style={[styles.badgeLabel, { color: item.badgeColor ?? colors.primary }]}>{item.badge}</Text>
                        </View>
                      )}
                      {item.value && !item.badge && (
                        <Text style={[styles.settingValue, { color: colors.mutedForeground }]} numberOfLines={1}>{item.value}</Text>
                      )}
                      {!item.danger && <Feather name="chevron-right" size={16} color={colors.mutedForeground} />}
                    </View>
                  </TouchableOpacity>
                  {i < section.items.length - 1 && (
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  )}
                </React.Fragment>
              );
            })}
          </View>
        </View>
      ))}

      <Text style={[styles.version, { color: colors.mutedForeground }]}>
        Zebvix v1.0.0 · FIU-IND Compliant · PMLA 2002
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  banner: { paddingHorizontal: 16, paddingBottom: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  avatarSection: { alignItems: "center", paddingVertical: 20, gap: 6 },
  avatarRing: { borderWidth: 2, borderRadius: 50, padding: 3, marginBottom: 6 },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 34, fontWeight: "900" },
  userName: { fontSize: 20, fontWeight: "800" },
  userEmail: { fontSize: 13 },
  kycBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, marginTop: 4 },
  kycLabel: { fontSize: 12, fontWeight: "700" },
  loginCta: { paddingHorizontal: 28, paddingVertical: 10, borderRadius: 20, marginTop: 8 },
  loginCtaLabel: { color: "#fff", fontWeight: "700", fontSize: 14 },
  statsRow: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16, gap: 0 },
  statItem: { flex: 1, alignItems: "center", gap: 4 },
  statValue: { fontSize: 14, fontWeight: "700" },
  statLabel: { fontSize: 11 },
  secCard: { marginHorizontal: 16, marginTop: 14, borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  secTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  secLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  secRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  secTitle: { fontSize: 14, fontWeight: "700" },
  secScore: { fontSize: 16, fontWeight: "800" },
  secTrack: { height: 6, borderRadius: 3 },
  secFill: { height: 6, borderRadius: 3 },
  secHint: { fontSize: 11 },
  section: { marginTop: 20, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 8 },
  sectionCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  settingRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  settingIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  settingLabel: { flex: 1, fontSize: 14, fontWeight: "500" },
  settingRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeLabel: { fontSize: 11, fontWeight: "700" },
  settingValue: { fontSize: 12, maxWidth: 80 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 62 },
  version: { textAlign: "center", fontSize: 11, marginTop: 24, marginBottom: 8 },
});
