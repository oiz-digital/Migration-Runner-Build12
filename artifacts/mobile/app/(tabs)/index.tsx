import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
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
import { CoinRowWithSpark } from "@/components/CoinRowWithSpark";
import { SparkLine } from "@/components/SparkLine";
import { AnimatedPrice } from "@/components/AnimatedPrice";

const { width: SCREEN_W } = Dimensions.get("window");

const GREEN = "#0ECB81";
const RED = "#F6465D";

interface WalletItem { symbol: string; balance: string; locked: string }
interface WalletResponse { wallets: WalletItem[] }

function genSparkData(price: number, change24h: number, symbol: string, n = 20): number[] {
  let seed = symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const start = price / (1 + change24h / 100);
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push(Math.max(start + start * (change24h / 100) * t + (rng() - 0.5) * start * 0.012, 1e-8));
  }
  pts[n - 1] = price;
  return pts;
}

const QUICK_ACTIONS = [
  { label: "Deposit", icon: "arrow-down-circle" as const, route: "/(tabs)/assets", color: GREEN },
  { label: "Withdraw", icon: "arrow-up-circle" as const, route: "/(tabs)/assets", color: RED },
  { label: "Buy Crypto", icon: "shopping-cart" as const, route: "/convert", color: "#F0B90B" },
  { label: "P2P Trading", icon: "users" as const, route: "/p2p", color: "#9945ff" },
  { label: "More", icon: "grid" as const, route: "/(tabs)/markets", color: "#848E9C" },
];

const COIN_COLORS: Record<string, string> = {
  BTC: "#f7931a", ETH: "#627eea", BNB: "#f3ba2f", XRP: "#346aa9",
  SOL: "#9945ff", ADA: "#3cc8c8", USDT: "#26a17b", MATIC: "#8247e5",
  AVAX: "#e84142", DOT: "#e6007a", LINK: "#2a5ada", DOGE: "#c2a633",
};

const PROMO_BANNERS = [
  { id: "1", title: "Invite Friends & Earn", sub: "Get 30% commission on every referral trade", accent: GREEN, icon: "gift" as const },
  { id: "2", title: "Earn up to 28% APY", sub: "Fixed and flexible staking pools now available", accent: "#F0B90B", icon: "percent" as const },
  { id: "3", title: "Zero-Fee P2P in INR", sub: "Buy & sell directly with verified Indian traders", accent: "#9945ff", icon: "users" as const },
  { id: "4", title: "100× Futures Trading", sub: "Professional perpetual contracts, no expiry", accent: RED, icon: "trending-up" as const },
];

const SERVICES_GRID = [
  { label: "AI Trading", icon: "cpu" as const, route: "/ai-trading", color: "#9945ff", badge: "NEW" },
  { label: "Trading Bots", icon: "grid" as const, route: "/bots", color: "#eb9100", badge: "" },
  { label: "Earn", icon: "percent" as const, route: "/earn", color: GREEN, badge: "28% APY" },
  { label: "Copy Trade", icon: "copy" as const, route: "/copy-trading", color: "#627eea", badge: "" },
  { label: "Options", icon: "activity" as const, route: "/options", color: RED, badge: "" },
  { label: "Convert", icon: "repeat" as const, route: "/convert", color: "#0ECB81", badge: "" },
  { label: "INR Pay", icon: "credit-card" as const, route: "/inr-payments", color: "#F0B90B", badge: "" },
  { label: "Referrals", icon: "gift" as const, route: "/invite", color: "#eb9100", badge: "30%" },
  { label: "P2P", icon: "users" as const, route: "/p2p", color: "#9945ff", badge: "" },
  { label: "Ledger", icon: "book" as const, route: "/ledger", color: "#848E9C", badge: "" },
  { label: "Portfolio", icon: "pie-chart" as const, route: "/portfolio", color: "#627eea", badge: "" },
  { label: "Price Alerts", icon: "bell" as const, route: "/price-alerts", color: "#F0B90B", badge: "" },
];

type MTab = "hot" | "gainers" | "losers";

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const { ticks, priceMap, inrRate } = usePrices();
  const [mTab, setMTab] = useState<MTab>("hot");
  const [bannerIdx, setBannerIdx] = useState(0);
  const bannerRef = useRef<ScrollView>(null);

  const { data: walletData, isLoading, refetch } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => apiFetch<WalletResponse>("/api/finance/wallet"),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const totalUsdt = useMemo(() => {
    if (!walletData?.wallets) return 0;
    return walletData.wallets.reduce((sum, w) => {
      const bal = parseFloat(w.balance) || 0;
      const tick = priceMap[w.symbol.toUpperCase()];
      if (w.symbol.toUpperCase() === "USDT") return sum + bal;
      if (w.symbol.toUpperCase() === "INR") return sum + bal / inrRate;
      const px = tick?.usdt ?? 0;
      return sum + bal * px;
    }, 0);
  }, [walletData, priceMap, inrRate]);

  const btcEquiv = totalUsdt / (priceMap["BTC"]?.usdt ?? 1);

  const portfolioChange24h = useMemo(() => {
    if (!walletData?.wallets || totalUsdt === 0) return 0;
    const weighted = walletData.wallets.reduce((sum, w) => {
      const bal = parseFloat(w.balance) || 0;
      const tick = priceMap[w.symbol.toUpperCase()];
      const px = tick?.usdt ?? 0;
      const val = bal * px;
      return sum + val * (tick?.change24h ?? 0) / 100;
    }, 0);
    return totalUsdt > 0 ? (weighted / totalUsdt) * 100 : 0;
  }, [walletData, priceMap, totalUsdt]);

  const marketList = useMemo(() => {
    const base = ticks.filter((t) => t.usdt > 0 && t.symbol !== "USDT" && t.symbol !== "INR");
    if (mTab === "gainers") return [...base].sort((a, b) => b.change24h - a.change24h).slice(0, 10);
    if (mTab === "losers") return [...base].sort((a, b) => a.change24h - b.change24h).slice(0, 10);
    return [...base].sort((a, b) => (b.usdt * (b.volume24h ?? 0)) - (a.usdt * (a.volume24h ?? 0))).slice(0, 10);
  }, [ticks, mTab]);

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);
  const onRefresh = useCallback(() => { void refetch(); }, [refetch]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topPt, paddingBottom: botPt + 100 }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={GREEN} />}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.hello, { color: colors.mutedForeground }]}>
              {isAuthenticated ? `Hello, ${user?.name?.split(" ")[0] ?? "User"}! 👋` : "Welcome! 👋"}
            </Text>
            <Text style={[styles.welcomeBack, { color: colors.foreground }]}>Welcome back</Text>
          </View>
          <View style={styles.headerIcons}>
            <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.muted }]} onPress={() => router.push("/notifications" as any)}>
              <Feather name="bell" size={18} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.muted }]} onPress={() => {}}>
              <Feather name="search" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Balance Card ── */}
        <View style={[styles.balCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.balTop}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.balLabel, { color: colors.mutedForeground }]}>Total Balance</Text>
              <AnimatedPrice
                price={isAuthenticated ? totalUsdt : 0}
                format={(p) => isAuthenticated ? `$${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00"}
                style={[styles.balValue, { color: colors.foreground }]}
              />
              <Text style={[styles.balSub, { color: colors.mutedForeground }]}>
                {isAuthenticated ? `≈ ${btcEquiv.toFixed(4)} BTC` : "Login to view balance"}
              </Text>
              {isAuthenticated && (
                <View style={styles.changeRow}>
                  <View style={[styles.changeBadge, { backgroundColor: (portfolioChange24h >= 0 ? GREEN : RED) + "22" }]}>
                    <Feather name={portfolioChange24h >= 0 ? "trending-up" : "trending-down"} size={12} color={portfolioChange24h >= 0 ? GREEN : RED} />
                    <Text style={[styles.changeText, { color: portfolioChange24h >= 0 ? GREEN : RED }]}>
                      {portfolioChange24h >= 0 ? "+" : ""}{portfolioChange24h.toFixed(2)}%
                    </Text>
                    <Text style={[styles.changeLabel, { color: colors.mutedForeground }]}>24h Change</Text>
                  </View>
                </View>
              )}
            </View>
            {isAuthenticated && (
              <SparkLine
                data={genSparkData(totalUsdt, portfolioChange24h, "portfolio")}
                width={100}
                height={50}
                positive={portfolioChange24h >= 0}
                id="portfolio"
              />
            )}
          </View>

          {/* Quick Actions */}
          <View style={styles.actionsRow}>
            {QUICK_ACTIONS.map((a) => (
              <TouchableOpacity
                key={a.label}
                style={styles.actionItem}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (!isAuthenticated && a.route !== "/(tabs)/markets") { router.push("/login"); return; }
                  router.push(a.route as any);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.actionIcon, { backgroundColor: a.color + "22" }]}>
                  <Feather name={a.icon} size={20} color={a.color} />
                </View>
                <Text style={[styles.actionLabel, { color: colors.mutedForeground }]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Promo Banners ── */}
        <View style={styles.bannerWrap}>
          <ScrollView
            ref={bannerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setBannerIdx(Math.round(e.nativeEvent.contentOffset.x / (SCREEN_W - 32)))}
          >
            {PROMO_BANNERS.map((b) => (
              <View
                key={b.id}
                style={[styles.bannerCard, { backgroundColor: colors.card, borderColor: b.accent + "40", width: SCREEN_W - 32 }]}
              >
                <LinearGradient
                  colors={[b.accent + "20", "transparent"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={[styles.bannerIconBg, { backgroundColor: b.accent + "22" }]}>
                  <Feather name={b.icon} size={22} color={b.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bannerTitle, { color: colors.foreground }]}>{b.title}</Text>
                  <Text style={[styles.bannerSub, { color: colors.mutedForeground }]}>{b.sub}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </View>
            ))}
          </ScrollView>
          <View style={styles.bannerDots}>
            {PROMO_BANNERS.map((_, i) => (
              <View key={i} style={[styles.dot, { backgroundColor: i === bannerIdx ? GREEN : colors.border, width: i === bannerIdx ? 16 : 6 }]} />
            ))}
          </View>
        </View>

        {/* ── Services Grid ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Services</Text>
          </View>
          <View style={[styles.servicesCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.servicesGrid}>
              {SERVICES_GRID.map((svc) => (
                <TouchableOpacity
                  key={svc.label}
                  style={styles.svcItem}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (!isAuthenticated) { router.push("/login"); return; }
                    router.push(svc.route as any);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.svcIconWrap, { backgroundColor: svc.color + "22" }]}>
                    <Feather name={svc.icon} size={22} color={svc.color} />
                    {svc.badge ? (
                      <View style={[styles.svcBadge, { backgroundColor: svc.color }]}>
                        <Text style={styles.svcBadgeText}>{svc.badge}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.svcLabel, { color: colors.mutedForeground }]}>{svc.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* ── Market Overview ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Market Overview</Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/markets")}>
              <Text style={[styles.seeAll, { color: GREEN }]}>See All</Text>
            </TouchableOpacity>
          </View>

          {/* Market tabs */}
          <View style={[styles.mTabRow, { backgroundColor: colors.muted, borderRadius: 8 }]}>
            {(["hot", "gainers", "losers"] as MTab[]).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.mTabBtn, mTab === tab && { backgroundColor: colors.card, borderRadius: 6 }]}
                onPress={() => setMTab(tab)}
              >
                <Text style={[styles.mTabLabel, { color: mTab === tab ? GREEN : colors.mutedForeground }]}>
                  {tab === "hot" ? "🔥 Hot" : tab === "gainers" ? "📈 Gainers" : "📉 Losers"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Coin list */}
          <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Column headers */}
            <View style={[styles.colHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.colLabel, { color: colors.mutedForeground, flex: 1 }]}>Coin</Text>
              <Text style={[styles.colLabel, { color: colors.mutedForeground, width: 70 }]}>Last Price</Text>
              <Text style={[styles.colLabel, { color: colors.mutedForeground, width: 70, textAlign: "right" }]}>24h Chg%</Text>
            </View>

            {marketList.map((t, i) => {
              const coinColor = COIN_COLORS[t.symbol] ?? "#6b7a9e";
              const spark = genSparkData(t.usdt, t.change24h, t.symbol);
              const priceStr = t.usdt < 0.01 ? t.usdt.toFixed(6) : t.usdt < 100 ? t.usdt.toFixed(4) : t.usdt.toLocaleString("en-US", { maximumFractionDigits: 0 });
              return (
                <TouchableOpacity
                  key={t.symbol}
                  style={[styles.coinRow, { borderBottomColor: colors.border, borderBottomWidth: i < marketList.length - 1 ? StyleSheet.hairlineWidth : 0 }]}
                  onPress={() => router.push(`/trade/${t.symbol}USDT` as any)}
                  activeOpacity={0.7}
                >
                  <View style={styles.coinLeft}>
                    <View style={[styles.coinCircle, { backgroundColor: coinColor + "22" }]}>
                      <Text style={[styles.coinLetter, { color: coinColor }]}>{t.symbol.charAt(0)}</Text>
                    </View>
                    <View>
                      <Text style={[styles.coinSym, { color: colors.foreground }]}>{t.symbol}</Text>
                      <Text style={[styles.coinName, { color: colors.mutedForeground }]}>{t.symbol}/USDT</Text>
                    </View>
                  </View>
                  <SparkLine data={spark} width={60} height={30} positive={t.change24h >= 0} id={`h${t.symbol}`} />
                  <View style={{ width: 70, alignItems: "flex-start" }}>
                    <Text style={[styles.coinPrice, { color: colors.foreground }]}>${priceStr}</Text>
                  </View>
                  <View style={[styles.changePill, { backgroundColor: (t.change24h >= 0 ? GREEN : RED) + "22", width: 70 }]}>
                    <Text style={[styles.changePct, { color: t.change24h >= 0 ? GREEN : RED }]}>
                      {t.change24h >= 0 ? "+" : ""}{t.change24h.toFixed(2)}%
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {marketList.length === 0 && (
              <View style={{ padding: 24, alignItems: "center" }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Connecting to live markets...</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  hello: { fontSize: 13, fontWeight: "500" },
  welcomeBack: { fontSize: 20, fontWeight: "800" },
  headerIcons: { flexDirection: "row", gap: 8 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  balCard: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, padding: 20, marginBottom: 16 },
  balTop: { flexDirection: "row", alignItems: "flex-start", marginBottom: 20 },
  balLabel: { fontSize: 12, fontWeight: "500", marginBottom: 4 },
  balValue: { fontSize: 32, fontWeight: "900", letterSpacing: -0.5 },
  balSub: { fontSize: 12, marginTop: 4 },
  changeRow: { marginTop: 8 },
  changeBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: "flex-start" },
  changeText: { fontSize: 12, fontWeight: "700" },
  changeLabel: { fontSize: 11 },
  actionsRow: { flexDirection: "row", justifyContent: "space-between" },
  actionItem: { alignItems: "center", gap: 6, flex: 1 },
  actionIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 10, fontWeight: "600", textAlign: "center" },
  bannerWrap: { paddingHorizontal: 16, marginBottom: 20 },
  bannerCard: { borderRadius: 12, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, overflow: "hidden" },
  bannerIconBg: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  bannerTitle: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  bannerSub: { fontSize: 11, lineHeight: 16 },
  bannerDots: { flexDirection: "row", justifyContent: "center", gap: 5, marginTop: 10, alignItems: "center" },
  dot: { height: 6, borderRadius: 3 },
  section: { paddingHorizontal: 16, marginBottom: 8 },
  servicesCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden", padding: 8 },
  servicesGrid: { flexDirection: "row", flexWrap: "wrap" },
  svcItem: { width: "25%", alignItems: "center", paddingVertical: 14, gap: 6 },
  svcIconWrap: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  svcBadge: { position: "absolute", top: -4, right: -4, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 6 },
  svcBadgeText: { fontSize: 7, fontWeight: "800", color: "#fff" },
  svcLabel: { fontSize: 10, fontWeight: "600", textAlign: "center" },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "800" },
  seeAll: { fontSize: 13, fontWeight: "600" },
  mTabRow: { flexDirection: "row", padding: 3, marginBottom: 12, gap: 2 },
  mTabBtn: { flex: 1, paddingVertical: 7, alignItems: "center" },
  mTabLabel: { fontSize: 11, fontWeight: "700" },
  listCard: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  colHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  colLabel: { fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  coinRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10 },
  coinLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  coinCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  coinLetter: { fontSize: 14, fontWeight: "800" },
  coinSym: { fontSize: 13, fontWeight: "700" },
  coinName: { fontSize: 11, marginTop: 1 },
  coinPrice: { fontSize: 13, fontWeight: "600" },
  changePill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignItems: "center" },
  changePct: { fontSize: 12, fontWeight: "700" },
});
