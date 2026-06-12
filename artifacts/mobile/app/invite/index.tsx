import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  Share,
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

interface ReferralStats {
  code?: string;
  link?: string;
  totalReferrals?: number;
  activeReferrals?: number;
  totalEarned?: string;
  pendingEarned?: string;
}

interface ReferralUser {
  id: number;
  name: string;
  email: string;
  joinedAt: string;
  status: "active" | "pending";
  earned: string;
}

const TIERS = [
  { tier: 1, label: "Direct Referral", pct: "30%", color: "#eb9100", icon: "user-plus" as const },
  { tier: 2, label: "2nd Level", pct: "10%", color: "#9945ff", icon: "users" as const },
  { tier: 3, label: "3rd Level", pct: "5%", color: "#627eea", icon: "globe" as const },
];

const HOW_STEPS = [
  { n: "1", title: "Share Your Code", desc: "Share your unique referral link or code with friends" },
  { n: "2", title: "They Register", desc: "Your friend signs up and completes KYC verification" },
  { n: "3", title: "They Trade", desc: "When they trade, you earn a percentage of their fees" },
  { n: "4", title: "Earn Rewards", desc: "Commissions credited to your wallet automatically" },
];

export default function InviteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"overview" | "referrals">("overview");

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const statsQ = useQuery<ReferralStats>({
    queryKey: ["referral-stats"],
    queryFn: () => apiFetch("/api/user/referral"),
    enabled: isAuthenticated,
  });

  const referralsQ = useQuery<{ referrals: ReferralUser[] }>({
    queryKey: ["referrals"],
    queryFn: () => apiFetch("/api/user/referral/list"),
    enabled: isAuthenticated && tab === "referrals",
  });

  const stats = statsQ.data;
  const referralCode = stats?.code ?? "ZEBVIX" + (user?.id ?? "");
  const referralLink = stats?.link ?? `https://zebvix.com/r/${referralCode}`;

  const copyCode = async () => {
    await Clipboard.setStringAsync(referralCode);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareLink = async () => {
    await Share.share({
      message: `Join me on Zebvix — India's premier crypto exchange! Use my referral code ${referralCode} and get exclusive rewards.\n\n${referralLink}`,
      title: "Join Zebvix",
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={["#1a0f00", "#080e1a"]}
        style={[styles.header, { paddingTop: topPt + 12 }]}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Referral Program</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView contentContainerStyle={{ paddingBottom: botPt + 30 }} showsVerticalScrollIndicator={false}>
        {/* Hero banner */}
        <LinearGradient
          colors={["#1a0f00", "#0d1524"]}
          style={styles.heroBanner}
        >
          <View style={styles.heroIconWrap}>
            <Feather name="gift" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>Earn up to 30%</Text>
          <Text style={[styles.heroSub, { color: colors.mutedForeground }]}>
            Commission on every trade your referrals make — forever
          </Text>

          {/* Stats row */}
          <View style={[styles.heroStats, { backgroundColor: "#ffffff10", borderColor: colors.border }]}>
            {[
              { label: "Total Referrals", value: stats?.totalReferrals?.toString() ?? "0", icon: "users" as const },
              { label: "Active", value: stats?.activeReferrals?.toString() ?? "0", icon: "activity" as const },
              { label: "Total Earned", value: `$${parseFloat(stats?.totalEarned ?? "0").toFixed(2)}`, icon: "dollar-sign" as const },
            ].map((s) => (
              <View key={s.label} style={styles.heroStat}>
                <Feather name={s.icon} size={13} color={colors.primary} />
                <Text style={[styles.heroStatVal, { color: colors.foreground }]}>{s.value}</Text>
                <Text style={[styles.heroStatLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        {/* Referral code card */}
        <View style={[styles.codeCard, { backgroundColor: colors.card, borderColor: colors.primary + "40" }]}>
          <Text style={[styles.codeLabel, { color: colors.mutedForeground }]}>YOUR REFERRAL CODE</Text>
          <Text style={[styles.codeText, { color: colors.primary }]}>{referralCode}</Text>
          <Text style={[styles.linkText, { color: colors.mutedForeground }]} numberOfLines={1}>{referralLink}</Text>
          <View style={styles.codeBtns}>
            <TouchableOpacity
              style={[styles.codeBtn, { backgroundColor: copied ? "#0ECB81" : colors.primary }]}
              onPress={copyCode}
            >
              <Feather name={copied ? "check" : "copy"} size={16} color="#fff" />
              <Text style={styles.codeBtnLabel}>{copied ? "Copied!" : "Copy Code"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.codeBtn, { backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border }]}
              onPress={shareLink}
            >
              <Feather name="share-2" size={16} color={colors.foreground} />
              <Text style={[styles.codeBtnLabel, { color: colors.foreground }]}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Pending earnings */}
        {parseFloat(stats?.pendingEarned ?? "0") > 0 && (
          <View style={[styles.pendingCard, { backgroundColor: "#0ECB8115", borderColor: "#0ECB8140" }]}>
            <Feather name="clock" size={18} color="#0ECB81" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.pendingLabel, { color: "#0ECB81" }]}>Pending Commission</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Will be credited after 7 days</Text>
            </View>
            <Text style={[styles.pendingVal, { color: "#0ECB81" }]}>
              ${parseFloat(stats?.pendingEarned ?? "0").toFixed(2)}
            </Text>
          </View>
        )}

        {/* Commission tiers */}
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>COMMISSION STRUCTURE</Text>
          <View style={styles.tiersRow}>
            {TIERS.map((t) => (
              <View key={t.tier} style={[styles.tierCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.tierIconWrap, { backgroundColor: t.color + "20" }]}>
                  <Feather name={t.icon} size={20} color={t.color} />
                </View>
                <Text style={[styles.tierPct, { color: t.color }]}>{t.pct}</Text>
                <Text style={[styles.tierLabel, { color: colors.foreground }]}>Tier {t.tier}</Text>
                <Text style={[styles.tierDesc, { color: colors.mutedForeground }]}>{t.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* How it works */}
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>HOW IT WORKS</Text>
          {HOW_STEPS.map((s) => (
            <View key={s.n} style={styles.howRow}>
              <View style={[styles.howNum, { backgroundColor: colors.primary }]}>
                <Text style={styles.howNumText}>{s.n}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.howTitle, { color: colors.foreground }]}>{s.title}</Text>
                <Text style={[styles.howDesc, { color: colors.mutedForeground }]}>{s.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Tab: My Referrals */}
        <View style={styles.sectionWrap}>
          <View style={styles.tabRow}>
            {(["overview", "referrals"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.tabBtn, t === tab && { backgroundColor: colors.primary + "20", borderColor: colors.primary }]}
                onPress={() => setTab(t)}
              >
                <Text style={[styles.tabLabel, { color: t === tab ? colors.primary : colors.mutedForeground }]}>
                  {t === "overview" ? "Overview" : "My Referrals"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {tab === "referrals" && (
            referralsQ.isLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
            ) : (referralsQ.data?.referrals?.length ?? 0) === 0 ? (
              <View style={styles.emptyWrap}>
                <Feather name="users" size={40} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No referrals yet</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, textAlign: "center" }}>Share your code to start earning</Text>
              </View>
            ) : (
              referralsQ.data?.referrals.map((r) => (
                <View key={r.id} style={[styles.refRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[styles.refAvatar, { backgroundColor: colors.primary + "30" }]}>
                    <Text style={[styles.refAvatarChar, { color: colors.primary }]}>{r.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.refName, { color: colors.foreground }]}>{r.name}</Text>
                    <Text style={[styles.refDate, { color: colors.mutedForeground }]}>
                      Joined {new Date(r.joinedAt).toLocaleDateString("en-IN")}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.refEarned, { color: "#0ECB81" }]}>+${r.earned}</Text>
                    <View style={[styles.refStatus, { backgroundColor: r.status === "active" ? "#0ECB8120" : "#f59e0b20" }]}>
                      <Text style={{ color: r.status === "active" ? "#0ECB81" : "#f59e0b", fontSize: 10, fontWeight: "700" }}>
                        {r.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            )
          )}

          {tab === "overview" && (
            <View style={[styles.overviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {[
                { label: "Total Commission Earned", value: `$${parseFloat(stats?.totalEarned ?? "0").toFixed(4)}`, color: "#0ECB81" },
                { label: "Pending Commission", value: `$${parseFloat(stats?.pendingEarned ?? "0").toFixed(4)}`, color: "#f59e0b" },
                { label: "Total Referrals", value: stats?.totalReferrals?.toString() ?? "0", color: colors.primary },
                { label: "Active Traders", value: stats?.activeReferrals?.toString() ?? "0", color: "#627eea" },
              ].map((item, i, arr) => (
                <React.Fragment key={item.label}>
                  <View style={styles.ovRow}>
                    <Text style={[styles.ovLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
                    <Text style={[styles.ovVal, { color: item.color }]}>{item.value}</Text>
                  </View>
                  {i < arr.length - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                </React.Fragment>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700" },
  heroBanner: { padding: 24, alignItems: "center", gap: 8 },
  heroIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#eb910020", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  heroTitle: { fontSize: 28, fontWeight: "800" },
  heroSub: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  heroStats: { flexDirection: "row", width: "100%", borderRadius: 12, borderWidth: 1, marginTop: 8, padding: 12 },
  heroStat: { flex: 1, alignItems: "center", gap: 4 },
  heroStatVal: { fontSize: 16, fontWeight: "800" },
  heroStatLabel: { fontSize: 10 },
  codeCard: { margin: 16, borderRadius: 16, borderWidth: 1.5, padding: 20, alignItems: "center", gap: 8 },
  codeLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  codeText: { fontSize: 28, fontWeight: "900", letterSpacing: 4 },
  linkText: { fontSize: 11, maxWidth: "90%" },
  codeBtns: { flexDirection: "row", gap: 10, marginTop: 8, width: "100%" },
  codeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 10, gap: 6 },
  codeBtnLabel: { color: "#fff", fontWeight: "700", fontSize: 14 },
  pendingCard: { marginHorizontal: 16, marginBottom: 4, borderRadius: 12, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  pendingLabel: { fontWeight: "700", fontSize: 14 },
  pendingVal: { fontSize: 18, fontWeight: "800" },
  sectionWrap: { marginTop: 20, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 12 },
  tiersRow: { flexDirection: "row", gap: 10 },
  tierCard: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 14, alignItems: "center", gap: 6 },
  tierIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  tierPct: { fontSize: 20, fontWeight: "900" },
  tierLabel: { fontSize: 12, fontWeight: "700" },
  tierDesc: { fontSize: 10, textAlign: "center" },
  howRow: { flexDirection: "row", gap: 14, marginBottom: 14, alignItems: "flex-start" },
  howNum: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  howNumText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  howTitle: { fontSize: 14, fontWeight: "700" },
  howDesc: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  tabRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "transparent", alignItems: "center" },
  tabLabel: { fontSize: 14, fontWeight: "600" },
  emptyWrap: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: "600" },
  refRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 8, gap: 12 },
  refAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  refAvatarChar: { fontSize: 16, fontWeight: "700" },
  refName: { fontSize: 14, fontWeight: "600" },
  refDate: { fontSize: 11, marginTop: 2 },
  refEarned: { fontSize: 14, fontWeight: "700" },
  refStatus: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 2 },
  overviewCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  ovRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 },
  ovLabel: { fontSize: 14 },
  ovVal: { fontSize: 15, fontWeight: "700" },
  divider: { height: StyleSheet.hairlineWidth },
});
