import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Platform,
  RefreshControl,
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
import { usePrices } from "@/hooks/usePrices";
import { apiFetch } from "@/hooks/useApi";
import { AnimatedPrice } from "@/components/AnimatedPrice";

const GREEN = "#0ECB81";
const RED = "#F6465D";
const YELLOW = "#F0B90B";

const COIN_COLORS: Record<string, string> = {
  BTC: "#f7931a", ETH: "#627eea", BNB: "#f3ba2f", XRP: "#346aa9",
  SOL: "#9945ff", ADA: "#3cc8c8", USDT: "#26a17b", INR: "#ff9933",
  MATIC: "#8247e5", AVAX: "#e84142", DOT: "#e6007a", LINK: "#2a5ada",
  DOGE: "#c2a633", DEFAULT: "#6b7a9e",
};

const KYC_LABELS = ["Unverified", "Level 1 — PAN", "Level 2 — Aadhaar", "Level 3 — EDD"];
const KYC_COLORS = [RED, YELLOW, GREEN, GREEN];

interface WalletItem { symbol: string; balance: string; locked: string }
interface WalletResponse { wallets: WalletItem[] }

type AssetTab = "overview" | "spot" | "futures" | "earn";

export default function AssetsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();
  const { priceMap, inrRate } = usePrices();
  const [assetTab, setAssetTab] = useState<AssetTab>("overview");
  const [hideBalance, setHideBalance] = useState(false);

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => apiFetch<WalletResponse>("/api/finance/wallet"),
    enabled: isAuthenticated,
    refetchInterval: 15_000,
  });

  const wallets = useMemo(() =>
    (data?.wallets ?? [])
      .map((w) => {
        const bal = parseFloat(w.balance) || 0;
        const tick = priceMap[w.symbol.toUpperCase()];
        const pxUsdt = w.symbol.toUpperCase() === "USDT" ? 1 : w.symbol.toUpperCase() === "INR" ? 1 / inrRate : (tick?.usdt ?? 0);
        return { ...w, bal, valueUsdt: bal * pxUsdt, change24h: tick?.change24h ?? 0 };
      })
      .filter((w) => w.bal > 0)
      .sort((a, b) => b.valueUsdt - a.valueUsdt),
    [data, priceMap, inrRate]
  );

  const totalUsdt = useMemo(() => wallets.reduce((s, w) => s + w.valueUsdt, 0), [wallets]);
  const totalInr = totalUsdt * inrRate;

  const kycLevel = user?.kycLevel ?? 0;
  const kycLabel = KYC_LABELS[kycLevel] ?? "Unverified";
  const kycColor = KYC_COLORS[kycLevel] ?? RED;

  const handleLogout = () => {
    if (Platform.OS === "web") {
      void logout();
    } else {
      Alert.alert("Log Out", "Are you sure you want to log out?", [
        { text: "Cancel", style: "cancel" },
        { text: "Log Out", style: "destructive", onPress: () => void logout() },
      ]);
    }
  };

  const ASSET_TABS: { key: AssetTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "spot", label: "Spot" },
    { key: "futures", label: "Futures" },
    { key: "earn", label: "Earn" },
  ];

  const WALLET_ACTIONS = [
    { icon: "arrow-down-circle" as const, label: "Deposit", color: GREEN, onPress: () => {} },
    { icon: "arrow-up-circle" as const, label: "Withdraw", color: RED, onPress: () => {} },
    { icon: "clock" as const, label: "History", color: colors.mutedForeground, onPress: () => router.push("/orders") },
    { icon: "repeat" as const, label: "Transfer", color: "#627eea", onPress: () => {} },
    { icon: "gift" as const, label: "Referral", color: YELLOW, onPress: () => router.push("/invite" as any) },
  ];

  const ACCOUNT_ITEMS = [
    { icon: "shield" as const, label: "Security Center", value: "", onPress: () => router.push("/settings" as any) },
    { icon: "user-check" as const, label: "Identity Verification", value: kycLabel, valueColor: kycColor, onPress: () => router.push("/kyc" as any) },
    { icon: "key" as const, label: "API Management", value: "", onPress: () => {} },
    { icon: "book-open" as const, label: "Address Book", value: "", onPress: () => {} },
    { icon: "activity" as const, label: "Login Activity", value: "", onPress: () => {} },
  ];

  const PREF_ITEMS = [
    { icon: "dollar-sign" as const, label: "Currency", value: "USD", onPress: () => {} },
    { icon: "globe" as const, label: "Language", value: "English", onPress: () => {} },
    { icon: "moon" as const, label: "Theme", value: "Dark", onPress: () => {} },
    { icon: "bell" as const, label: "Notifications", value: "On", onPress: () => router.push("/notifications" as any) },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Assets</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.muted }]} onPress={() => setHideBalance((h) => !h)}>
            <Feather name={hideBalance ? "eye-off" : "eye"} size={17} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.muted }]} onPress={() => router.push("/orders")}>
            <Feather name="clock" size={17} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.muted }]} onPress={() => router.push("/settings" as any)}>
            <Feather name="settings" size={17} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: botPt + 100 }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void refetch()} tintColor={GREEN} />}
      >
        {/* ── Profile Banner ── */}
        {isAuthenticated ? (
          <LinearGradient
            colors={["#0C3325", "#0B0E11"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.profileBanner}
          >
            <View style={styles.avatarWrap}>
              <View style={[styles.avatar, { backgroundColor: GREEN + "33", borderColor: GREEN }]}>
                <Text style={[styles.avatarLetter, { color: GREEN }]}>
                  {user?.name?.charAt(0).toUpperCase() ?? "U"}
                </Text>
              </View>
              <View style={[styles.verifiedBadge, { backgroundColor: kycColor + "22", borderColor: kycColor }]}>
                <Feather name={kycLevel >= 2 ? "check-circle" : "alert-circle"} size={10} color={kycColor} />
                <Text style={[styles.verifiedText, { color: kycColor }]}>{kycLabel}</Text>
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.userName, { color: "#EAECEF" }]}>{user?.name ?? "User"}</Text>
              <Text style={[styles.userEmail, { color: "#848E9C" }]}>{user?.email ?? ""}</Text>
              <Text style={[styles.userUid, { color: "#848E9C" }]}>UID: {user?.id ?? "—"}</Text>
            </View>
            <TouchableOpacity onPress={() => router.push("/settings" as any)}>
              <Feather name="edit-2" size={16} color="#848E9C" />
            </TouchableOpacity>
          </LinearGradient>
        ) : (
          <TouchableOpacity
            style={[styles.loginCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push("/login")}
          >
            <View style={[styles.avatar, { backgroundColor: colors.muted }]}>
              <Feather name="user" size={24} color={colors.mutedForeground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.loginTitle, { color: colors.foreground }]}>Login or Register</Text>
              <Text style={[styles.loginSub, { color: colors.mutedForeground }]}>Sign in to view your portfolio</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}

        {/* ── Balance Section ── */}
        <View style={[styles.balSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.balLabel, { color: colors.mutedForeground }]}>Total Balance</Text>
          <AnimatedPrice
            price={isAuthenticated ? totalUsdt : 0}
            format={(p) => hideBalance ? "$••••••" : `$${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            style={[styles.balValue, { color: colors.foreground }]}
          />
          <Text style={[styles.balSub, { color: colors.mutedForeground }]}>
            {isAuthenticated && !hideBalance ? `≈ ₹${totalInr.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : ""}
          </Text>

          {/* Action buttons */}
          <View style={styles.actionsRow}>
            {WALLET_ACTIONS.map((a) => (
              <TouchableOpacity key={a.label} style={styles.actionBtn} onPress={a.onPress}>
                <View style={[styles.actionIcon, { backgroundColor: a.color + "22" }]}>
                  <Feather name={a.icon} size={20} color={a.color} />
                </View>
                <Text style={[styles.actionLabel, { color: colors.mutedForeground }]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Asset Tabs ── */}
        <View style={[styles.tabRowWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {ASSET_TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabBtn, assetTab === tab.key && { borderBottomColor: GREEN, borderBottomWidth: 2 }]}
              onPress={() => setAssetTab(tab.key)}
            >
              <Text style={[styles.tabLabel, { color: assetTab === tab.key ? GREEN : colors.mutedForeground }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Asset List ── */}
        {!isAuthenticated ? (
          <View style={{ padding: 32, alignItems: "center" }}>
            <Feather name="lock" size={32} color={colors.border} />
            <Text style={{ color: colors.mutedForeground, marginTop: 12 }}>Login to view assets</Text>
          </View>
        ) : wallets.length === 0 && !isLoading ? (
          <View style={{ padding: 32, alignItems: "center" }}>
            <Feather name="credit-card" size={32} color={colors.border} />
            <Text style={{ color: colors.mutedForeground, marginTop: 12 }}>No assets yet. Deposit to get started.</Text>
          </View>
        ) : (
          <View style={[styles.assetList, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.listTitle, { color: colors.mutedForeground }]}>My Assets</Text>
            {wallets.map((w, i) => {
              const coinColor = COIN_COLORS[w.symbol.toUpperCase()] ?? COIN_COLORS.DEFAULT;
              const pct = totalUsdt > 0 ? (w.valueUsdt / totalUsdt) * 100 : 0;
              return (
                <TouchableOpacity
                  key={w.symbol}
                  style={[styles.assetRow, { borderBottomColor: colors.border, borderBottomWidth: i < wallets.length - 1 ? StyleSheet.hairlineWidth : 0 }]}
                  onPress={() => router.push(`/wallet/${w.symbol}` as any)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.coinCircle, { backgroundColor: coinColor + "22" }]}>
                    <Text style={[styles.coinLetter, { color: coinColor }]}>{w.symbol.charAt(0)}</Text>
                  </View>
                  <View style={styles.assetMid}>
                    <View style={styles.assetTopRow}>
                      <Text style={[styles.assetSym, { color: colors.foreground }]}>{w.symbol}</Text>
                      <Text style={[styles.assetBal, { color: colors.foreground }]}>
                        {hideBalance ? "••••" : w.bal < 0.00001 ? w.bal.toExponential(2) : w.bal.toFixed(w.bal < 0.01 ? 6 : 4)}
                      </Text>
                    </View>
                    <View style={styles.assetBotRow}>
                      <Text style={[styles.assetPct, { color: colors.mutedForeground }]}>{pct.toFixed(1)}%</Text>
                      <Text style={[styles.assetVal, { color: colors.mutedForeground }]}>
                        {hideBalance ? "$••••" : `$${w.valueUsdt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </Text>
                    </View>
                    <View style={[styles.pctBar, { backgroundColor: colors.muted }]}>
                      <View style={[styles.pctFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: coinColor }]} />
                    </View>
                  </View>
                  <Text style={[styles.change24h, { color: w.change24h >= 0 ? GREEN : RED }]}>
                    {w.change24h >= 0 ? "+" : ""}{w.change24h.toFixed(2)}%
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── Account Section ── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Account</Text>
          {ACCOUNT_ITEMS.map((item, i) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.menuRow, { borderBottomColor: colors.border, borderBottomWidth: i < ACCOUNT_ITEMS.length - 1 ? StyleSheet.hairlineWidth : 0 }]}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIcon, { backgroundColor: colors.muted }]}>
                <Feather name={item.icon} size={16} color={colors.foreground} />
              </View>
              <Text style={[styles.menuLabel, { color: colors.foreground, flex: 1 }]}>{item.label}</Text>
              {item.value ? <Text style={[styles.menuValue, { color: (item as any).valueColor ?? colors.mutedForeground }]}>{item.value}</Text> : null}
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Preferences ── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Preferences</Text>
          {PREF_ITEMS.map((item, i) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.menuRow, { borderBottomColor: colors.border, borderBottomWidth: i < PREF_ITEMS.length - 1 ? StyleSheet.hairlineWidth : 0 }]}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIcon, { backgroundColor: colors.muted }]}>
                <Feather name={item.icon} size={16} color={colors.foreground} />
              </View>
              <Text style={[styles.menuLabel, { color: colors.foreground, flex: 1 }]}>{item.label}</Text>
              <Text style={[styles.menuValue, { color: colors.mutedForeground }]}>{item.value}</Text>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Logout ── */}
        {isAuthenticated && (
          <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
            <TouchableOpacity style={[styles.logoutBtn, { backgroundColor: RED + "18", borderColor: RED + "40" }]} onPress={handleLogout}>
              <Feather name="log-out" size={16} color={RED} />
              <Text style={[styles.logoutText, { color: RED }]}>Log Out</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 22, fontWeight: "800" },
  headerRight: { flexDirection: "row", gap: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  profileBanner: { flexDirection: "row", alignItems: "center", padding: 20, gap: 14, marginBottom: 1 },
  avatarWrap: { alignItems: "center", gap: 6 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  avatarLetter: { fontSize: 22, fontWeight: "800" },
  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  verifiedText: { fontSize: 9, fontWeight: "700" },
  userName: { fontSize: 16, fontWeight: "800" },
  userEmail: { fontSize: 12, marginTop: 2 },
  userUid: { fontSize: 11, marginTop: 2 },
  loginCard: { flexDirection: "row", alignItems: "center", margin: 16, borderRadius: 14, borderWidth: 1, padding: 16, gap: 14 },
  loginTitle: { fontSize: 15, fontWeight: "700" },
  loginSub: { fontSize: 12, marginTop: 2 },
  balSection: { paddingHorizontal: 20, paddingVertical: 20, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  balLabel: { fontSize: 12, fontWeight: "500", marginBottom: 4 },
  balValue: { fontSize: 30, fontWeight: "900", letterSpacing: -0.5 },
  balSub: { fontSize: 12, marginTop: 4, marginBottom: 16 },
  actionsRow: { flexDirection: "row", justifyContent: "space-between" },
  actionBtn: { alignItems: "center", flex: 1, gap: 6 },
  actionIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 10, fontWeight: "600" },
  tabRowWrap: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, borderTopWidth: StyleSheet.hairlineWidth },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabLabel: { fontSize: 12, fontWeight: "700" },
  assetList: { marginTop: 8, marginHorizontal: 16, borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  listTitle: { fontSize: 12, fontWeight: "600", paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  assetRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  coinCircle: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  coinLetter: { fontSize: 16, fontWeight: "800" },
  assetMid: { flex: 1, gap: 3 },
  assetTopRow: { flexDirection: "row", justifyContent: "space-between" },
  assetBotRow: { flexDirection: "row", justifyContent: "space-between" },
  assetSym: { fontSize: 14, fontWeight: "700" },
  assetBal: { fontSize: 13, fontWeight: "600" },
  assetPct: { fontSize: 11 },
  assetVal: { fontSize: 11 },
  pctBar: { height: 2, borderRadius: 1, marginTop: 3 },
  pctFill: { height: 2, borderRadius: 1 },
  change24h: { fontSize: 12, fontWeight: "700", width: 56, textAlign: "right" },
  section: { marginHorizontal: 16, marginTop: 12, borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  sectionTitle: { fontSize: 11, fontWeight: "700", paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 },
  menuRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  menuIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  menuLabel: { fontSize: 14, fontWeight: "500" },
  menuValue: { fontSize: 13 },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1 },
  logoutText: { fontSize: 15, fontWeight: "700" },
});
