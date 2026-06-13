import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import {
  Animated,
  Dimensions,
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
import { SparkLine } from "@/components/SparkLine";
import { AnimatedPrice } from "@/components/AnimatedPrice";

const { width: SCREEN_W } = Dimensions.get("window");
const GREEN = "#0ECB81";
const RED = "#F6465D";
const YELLOW = "#F0B90B";
const PURPLE = "#9945ff";

interface WalletItem { symbol: string; balance: string; locked: string }
interface WalletResponse { wallets: WalletItem[] }

const COIN_COLORS: Record<string, string> = {
  BTC: "#f7931a", ETH: "#627eea", BNB: "#f3ba2f", XRP: "#346aa9",
  SOL: "#9945ff", ADA: "#3cc8c8", USDT: "#26a17b", MATIC: "#8247e5",
  AVAX: "#e84142", DOT: "#e6007a", LINK: "#2a5ada", DOGE: "#c2a633",
  DEFAULT: "#6b7a9e",
};

function genSpark(price: number, change24h: number, symbol: string, n = 20): number[] {
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

const SERVICES = [
  { label: "AI Trading", icon: "cpu" as const, route: "/ai-trading", color: PURPLE, badge: "NEW" },
  { label: "Bots", icon: "grid" as const, route: "/bots", color: "#eb9100", badge: "" },
  { label: "Earn", icon: "percent" as const, route: "/earn", color: GREEN, badge: "28%" },
  { label: "Copy Trade", icon: "copy" as const, route: "/copy-trading", color: "#627eea", badge: "" },
  { label: "Options", icon: "activity" as const, route: "/options", color: RED, badge: "" },
  { label: "Convert", icon: "repeat" as const, route: "/convert", color: GREEN, badge: "" },
  { label: "INR Pay", icon: "credit-card" as const, route: "/inr-payments", color: YELLOW, badge: "" },
  { label: "Referrals", icon: "gift" as const, route: "/invite", color: "#eb9100", badge: "30%" },
  { label: "P2P", icon: "users" as const, route: "/p2p", color: PURPLE, badge: "" },
  { label: "Ledger", icon: "book" as const, route: "/ledger", color: "#848E9C", badge: "" },
  { label: "Portfolio", icon: "pie-chart" as const, route: "/portfolio", color: "#627eea", badge: "" },
  { label: "Alerts", icon: "bell" as const, route: "/price-alerts", color: YELLOW, badge: "" },
];

const QUICK = [
  { label: "Deposit", icon: "arrow-down-circle" as const, route: "/(tabs)/assets", color: GREEN },
  { label: "Withdraw", icon: "arrow-up-circle" as const, route: "/(tabs)/assets", color: RED },
  { label: "Buy Crypto", icon: "shopping-cart" as const, route: "/convert", color: YELLOW },
  { label: "P2P", icon: "users" as const, route: "/p2p", color: PURPLE },
  { label: "History", icon: "clock" as const, route: "/orders", color: "#848E9C" },
];

const PROMO = [
  { id: "1", title: "Invite & Earn 30%", sub: "Earn commission on every referral trade forever", color: GREEN, icon: "gift" as const },
  { id: "2", title: "Earn up to 28% APY", sub: "Fixed & flexible staking pools available now", color: YELLOW, icon: "percent" as const },
  { id: "3", title: "Zero-Fee P2P in INR", sub: "Buy & sell directly with verified Indian traders", color: PURPLE, icon: "users" as const },
  { id: "4", title: "100× Futures", sub: "Professional perpetual contracts with no expiry", color: RED, icon: "trending-up" as const },
];

type MTab = "hot" | "gainers" | "losers";

// Scrolling price ticker component
function LiveTicker({ ticks }: { ticks: any[] }) {
  const scrollX = useRef(new Animated.Value(0)).current;
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const tickerData = useMemo(() => ticks.filter(t => t.usdt > 0).slice(0, 20), [ticks]);
  const tickerStr = tickerData.map(t => {
    const p = t.usdt < 1 ? t.usdt.toFixed(4) : t.usdt < 100 ? t.usdt.toFixed(2) : t.usdt.toLocaleString("en-US", { maximumFractionDigits: 0 });
    return `${t.symbol} $${p}`;
  }).join("   ·   ");

  useEffect(() => {
    if (tickerStr.length === 0) return;
    const W = tickerStr.length * 7.5;
    scrollX.setValue(0);
    anim.current = Animated.loop(
      Animated.timing(scrollX, { toValue: -W, duration: W * 60, useNativeDriver: true })
    );
    anim.current.start();
    return () => anim.current?.stop();
  }, [tickerStr]);

  if (tickerData.length === 0) return null;
  return (
    <View style={ticker.wrap}>
      <Animated.Text style={[ticker.text, { transform: [{ translateX: scrollX }] }]}>
        {tickerStr}{"   ·   "}{tickerStr}
      </Animated.Text>
    </View>
  );
}
const ticker = StyleSheet.create({
  wrap: { height: 28, overflow: "hidden", justifyContent: "center" },
  text: { fontSize: 11, color: "#848E9C", fontWeight: "500", letterSpacing: 0.2 },
});

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const { ticks, priceMap, inrRate } = usePrices();
  const [mTab, setMTab] = useState<MTab>("hot");
  const [bannerIdx, setBannerIdx] = useState(0);
  const [hideBalance, setHideBalance] = useState(false);
  const bannerRef = useRef<ScrollView>(null);

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

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
      return sum + bal * (tick?.usdt ?? 0);
    }, 0);
  }, [walletData, priceMap, inrRate]);

  const totalInr = totalUsdt * inrRate;
  const btcEquiv = totalUsdt / (priceMap["BTC"]?.usdt ?? 1);

  const portfolioChange = useMemo(() => {
    if (!walletData?.wallets || totalUsdt === 0) return 0;
    const weighted = walletData.wallets.reduce((sum, w) => {
      const bal = parseFloat(w.balance) || 0;
      const tick = priceMap[w.symbol.toUpperCase()];
      const val = bal * (tick?.usdt ?? 0);
      return sum + val * (tick?.change24h ?? 0) / 100;
    }, 0);
    return totalUsdt > 0 ? (weighted / totalUsdt) * 100 : 0;
  }, [walletData, priceMap, totalUsdt]);

  const marketList = useMemo(() => {
    const base = ticks.filter(t => t.usdt > 0 && t.symbol !== "USDT" && t.symbol !== "INR");
    if (mTab === "gainers") return [...base].filter(t => t.change24h > 0).sort((a, b) => b.change24h - a.change24h).slice(0, 10);
    if (mTab === "losers") return [...base].filter(t => t.change24h < 0).sort((a, b) => a.change24h - b.change24h).slice(0, 10);
    return [...base].sort((a, b) => (b.usdt * (b.volume24h ?? 0)) - (a.usdt * (a.volume24h ?? 0))).slice(0, 10);
  }, [ticks, mTab]);

  const onRefresh = useCallback(() => { void refetch(); }, [refetch]);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* ── Sticky header ── */}
      <View style={[s.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={s.headerRow}>
          <View style={s.logoWrap}>
            <View style={[s.logoMark, { backgroundColor: GREEN }]}>
              <Text style={s.logoZ}>Z</Text>
            </View>
            <Text style={[s.logoText, { color: colors.foreground }]}>Zebvix</Text>
          </View>
          <View style={s.headerIcons}>
            <TouchableOpacity style={[s.iconBtn, { backgroundColor: colors.muted }]} onPress={() => router.push("/notifications" as any)}>
              <Feather name="bell" size={17} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity style={[s.iconBtn, { backgroundColor: colors.muted }]} onPress={() => router.push("/support" as any)}>
              <Feather name="help-circle" size={17} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity style={[s.iconBtn, { backgroundColor: colors.muted }]} onPress={() => router.push("/settings" as any)}>
              <Feather name="settings" size={17} color={colors.foreground} />
            </TouchableOpacity>
          </View>
        </View>
        {/* Live ticker */}
        <LiveTicker ticks={ticks} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: botPt + 100 }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={GREEN} />}
      >
        {/* ── Portfolio Card ── */}
        <LinearGradient
          colors={isAuthenticated ? ["#0D2E1E", "#151B22", "#0B0E11"] : ["#151B22", "#0B0E11"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[s.portfolioCard, { borderColor: colors.border }]}
        >
          <View style={s.portfolioTop}>
            <View>
              <Text style={[s.portfolioGreet, { color: "#848E9C" }]}>
                {isAuthenticated ? `👋 ${user?.name?.split(" ")[0] ?? "Welcome"}` : "Welcome to Zebvix"}
              </Text>
              <View style={s.balanceRow}>
                <AnimatedPrice
                  price={isAuthenticated ? totalUsdt : 0}
                  format={(p) => hideBalance ? "$••••••" : `$${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  style={s.balanceValue}
                />
                <TouchableOpacity onPress={() => setHideBalance(h => !h)} style={{ marginLeft: 8, marginTop: 4 }}>
                  <Feather name={hideBalance ? "eye-off" : "eye"} size={16} color="#848E9C" />
                </TouchableOpacity>
              </View>
              <Text style={[s.balanceSub, { color: "#848E9C" }]}>
                {isAuthenticated && !hideBalance
                  ? `≈ ₹${totalInr.toLocaleString("en-IN", { maximumFractionDigits: 0 })}  ·  ${btcEquiv.toFixed(6)} BTC`
                  : "Log in to view your portfolio"}
              </Text>
            </View>
            {isAuthenticated && portfolioChange !== 0 && (
              <View style={[s.changeBubble, { backgroundColor: (portfolioChange >= 0 ? GREEN : RED) + "22" }]}>
                <Feather name={portfolioChange >= 0 ? "trending-up" : "trending-down"} size={14} color={portfolioChange >= 0 ? GREEN : RED} />
                <Text style={[s.changeText, { color: portfolioChange >= 0 ? GREEN : RED }]}>
                  {portfolioChange >= 0 ? "+" : ""}{portfolioChange.toFixed(2)}%
                </Text>
                <Text style={[s.changeLabel, { color: "#848E9C" }]}>24h</Text>
              </View>
            )}
          </View>

          {/* Quick Actions */}
          <View style={s.quickRow}>
            {QUICK.map((q) => (
              <TouchableOpacity
                key={q.label}
                style={s.quickItem}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (!isAuthenticated && q.route !== "/convert") { router.push("/login"); return; }
                  router.push(q.route as any);
                }}
                activeOpacity={0.75}
              >
                <View style={[s.quickIcon, { backgroundColor: q.color + "25" }]}>
                  <Feather name={q.icon} size={18} color={q.color} />
                </View>
                <Text style={[s.quickLabel, { color: "#848E9C" }]}>{q.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </LinearGradient>

        {/* ── Promo Banners ── */}
        <View style={s.promoWrap}>
          <ScrollView
            ref={bannerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setBannerIdx(Math.round(e.nativeEvent.contentOffset.x / (SCREEN_W - 32)))}
          >
            {PROMO.map((b) => (
              <View key={b.id} style={[s.promoBanner, { width: SCREEN_W - 32, backgroundColor: colors.card, borderColor: b.color + "40" }]}>
                <LinearGradient colors={[b.color + "28", "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
                <View style={[s.promoIconWrap, { backgroundColor: b.color + "22" }]}>
                  <Feather name={b.icon} size={22} color={b.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.promoTitle, { color: "#EAECEF" }]}>{b.title}</Text>
                  <Text style={[s.promoSub, { color: "#848E9C" }]}>{b.sub}</Text>
                </View>
                <Feather name="chevron-right" size={16} color="#848E9C" />
              </View>
            ))}
          </ScrollView>
          <View style={s.promoDots}>
            {PROMO.map((_, i) => (
              <View key={i} style={[s.promoDot, { backgroundColor: i === bannerIdx ? GREEN : colors.border, width: i === bannerIdx ? 18 : 6 }]} />
            ))}
          </View>
        </View>

        {/* ── Services Grid ── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>Services</Text>
            <View style={[s.sectionBadge, { backgroundColor: GREEN + "22" }]}>
              <Text style={[s.sectionBadgeText, { color: GREEN }]}>12 Products</Text>
            </View>
          </View>
          <View style={[s.servicesCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.servicesGrid}>
              {SERVICES.map((svc) => (
                <TouchableOpacity
                  key={svc.label}
                  style={s.svcItem}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (!isAuthenticated) { router.push("/login"); return; }
                    router.push(svc.route as any);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[s.svcIconWrap, { backgroundColor: svc.color + "22" }]}>
                    <Feather name={svc.icon} size={22} color={svc.color} />
                    {svc.badge ? (
                      <View style={[s.svcBadge, { backgroundColor: svc.color }]}>
                        <Text style={s.svcBadgeText}>{svc.badge}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[s.svcLabel, { color: "#848E9C" }]}>{svc.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* ── Hot Picks (horizontal scroll) ── */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.foreground }]}>Hot Picks</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingTop: 12 }}>
            {ticks.filter(t => t.usdt > 0 && t.symbol !== "USDT").slice(0, 8).map((t) => {
              const c = COIN_COLORS[t.symbol] ?? COIN_COLORS.DEFAULT;
              const isPos = t.change24h >= 0;
              const p = t.usdt < 1 ? t.usdt.toFixed(4) : t.usdt < 1000 ? t.usdt.toFixed(2) : t.usdt.toLocaleString("en-US", { maximumFractionDigits: 0 });
              const spark = genSpark(t.usdt, t.change24h, t.symbol);
              return (
                <TouchableOpacity
                  key={t.symbol}
                  style={[s.hotCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => router.push(`/trade/${t.symbol}USDT` as any)}
                  activeOpacity={0.8}
                >
                  <LinearGradient colors={[c + "15", "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
                  <View style={s.hotTop}>
                    <View style={[s.hotCircle, { backgroundColor: c + "25" }]}>
                      <Text style={[s.hotLetter, { color: c }]}>{t.symbol.charAt(0)}</Text>
                    </View>
                    <View style={[s.hotChg, { backgroundColor: (isPos ? GREEN : RED) + "22" }]}>
                      <Text style={[s.hotChgText, { color: isPos ? GREEN : RED }]}>
                        {isPos ? "+" : ""}{t.change24h.toFixed(2)}%
                      </Text>
                    </View>
                  </View>
                  <Text style={[s.hotSym, { color: colors.foreground }]}>{t.symbol}</Text>
                  <Text style={[s.hotPrice, { color: colors.foreground }]}>${p}</Text>
                  <SparkLine data={spark} width={100} height={36} positive={isPos} id={`hp${t.symbol}`} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Market Overview ── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>Market Overview</Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/markets" as any)}>
              <Text style={[s.seeAll, { color: GREEN }]}>See All →</Text>
            </TouchableOpacity>
          </View>

          {/* Mini tabs */}
          <View style={[s.miniTabs, { backgroundColor: colors.muted }]}>
            {(["hot", "gainers", "losers"] as MTab[]).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[s.miniTab, mTab === tab && { backgroundColor: colors.card }]}
                onPress={() => setMTab(tab)}
              >
                <Text style={[s.miniTabText, { color: mTab === tab ? GREEN : "#848E9C" }]}>
                  {tab === "hot" ? "🔥 Hot" : tab === "gainers" ? "📈 Gainers" : "📉 Losers"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={[s.marketCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[s.marketColHeader, { borderBottomColor: colors.border }]}>
              <Text style={[s.colLabel, { color: "#848E9C", flex: 1 }]}>Coin</Text>
              <Text style={[s.colLabel, { color: "#848E9C", width: 55, textAlign: "center" }]}>Chart</Text>
              <Text style={[s.colLabel, { color: "#848E9C", width: 75, textAlign: "right" }]}>Price</Text>
              <Text style={[s.colLabel, { color: "#848E9C", width: 68, textAlign: "right" }]}>24h%</Text>
            </View>
            {marketList.map((t, i) => {
              const c = COIN_COLORS[t.symbol] ?? COIN_COLORS.DEFAULT;
              const isPos = t.change24h >= 0;
              const spark = genSpark(t.usdt, t.change24h, t.symbol);
              const p = t.usdt < 0.01 ? t.usdt.toFixed(6) : t.usdt < 100 ? t.usdt.toFixed(4) : t.usdt.toLocaleString("en-US", { maximumFractionDigits: 0 });
              return (
                <TouchableOpacity
                  key={t.symbol}
                  style={[s.marketRow, { borderBottomColor: colors.border, borderBottomWidth: i < marketList.length - 1 ? StyleSheet.hairlineWidth : 0 }]}
                  onPress={() => router.push(`/trade/${t.symbol}USDT` as any)}
                  activeOpacity={0.7}
                >
                  <View style={s.coinLeft}>
                    <View style={[s.coinCircle, { backgroundColor: c + "22" }]}>
                      <Text style={[s.coinLetter, { color: c }]}>{t.symbol.charAt(0)}</Text>
                    </View>
                    <View>
                      <Text style={[s.coinSym, { color: colors.foreground }]}>{t.symbol}</Text>
                      <Text style={[s.coinQuote, { color: "#848E9C" }]}>/USDT</Text>
                    </View>
                  </View>
                  <SparkLine data={spark} width={55} height={28} positive={isPos} id={`ho${t.symbol}`} />
                  <Text style={[s.coinPrice, { color: colors.foreground, width: 75, textAlign: "right" }]}>${p}</Text>
                  <View style={[s.chgPill, { backgroundColor: (isPos ? GREEN : RED) + "22", width: 68 }]}>
                    <Text style={[s.chgText, { color: isPos ? GREEN : RED }]}>
                      {isPos ? "+" : ""}{t.change24h.toFixed(2)}%
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            {marketList.length === 0 && (
              <View style={{ padding: 24, alignItems: "center" }}>
                <Text style={{ color: "#848E9C", fontSize: 13 }}>Connecting to live markets…</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Compliance footer ── */}
        <View style={s.footer}>
          <View style={[s.footerBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="shield" size={12} color={GREEN} />
            <Text style={[s.footerText, { color: "#848E9C" }]}>FIU-IND Registered · RBI Compliant · 256-bit SSL</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { borderBottomWidth: StyleSheet.hairlineWidth },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  logoWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoMark: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  logoZ: { fontSize: 16, fontWeight: "900", color: "#000" },
  logoText: { fontSize: 20, fontWeight: "800", letterSpacing: -0.5 },
  headerIcons: { flexDirection: "row", gap: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },

  portfolioCard: { marginHorizontal: 16, marginTop: 14, marginBottom: 16, borderRadius: 20, borderWidth: 1, padding: 20 },
  portfolioTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  portfolioGreet: { fontSize: 12, fontWeight: "500", marginBottom: 4 },
  balanceRow: { flexDirection: "row", alignItems: "center" },
  balanceValue: { fontSize: 34, fontWeight: "900", color: "#EAECEF", letterSpacing: -1 },
  balanceSub: { fontSize: 12, marginTop: 5 },
  changeBubble: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  changeText: { fontSize: 13, fontWeight: "700" },
  changeLabel: { fontSize: 11 },
  quickRow: { flexDirection: "row", justifyContent: "space-between" },
  quickItem: { alignItems: "center", flex: 1, gap: 6 },
  quickIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  quickLabel: { fontSize: 10, fontWeight: "600" },

  promoWrap: { paddingHorizontal: 16, marginBottom: 20 },
  promoBanner: { borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, overflow: "hidden" },
  promoIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  promoTitle: { fontSize: 13, fontWeight: "800", marginBottom: 3 },
  promoSub: { fontSize: 11, lineHeight: 15 },
  promoDots: { flexDirection: "row", justifyContent: "center", gap: 5, marginTop: 10, alignItems: "center" },
  promoDot: { height: 6, borderRadius: 3 },

  section: { paddingHorizontal: 16, marginBottom: 20 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: "800" },
  sectionBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  sectionBadgeText: { fontSize: 11, fontWeight: "700" },
  seeAll: { fontSize: 13, fontWeight: "600" },
  servicesCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden", padding: 6 },
  servicesGrid: { flexDirection: "row", flexWrap: "wrap" },
  svcItem: { width: "25%", alignItems: "center", paddingVertical: 14, gap: 6 },
  svcIconWrap: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  svcBadge: { position: "absolute", top: -4, right: -4, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 6 },
  svcBadgeText: { fontSize: 7, fontWeight: "900", color: "#fff" },
  svcLabel: { fontSize: 10, fontWeight: "600", textAlign: "center" },

  hotCard: { width: 120, borderRadius: 14, borderWidth: 1, padding: 12, gap: 4, overflow: "hidden" },
  hotTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  hotCircle: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  hotLetter: { fontSize: 14, fontWeight: "800" },
  hotChg: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 },
  hotChgText: { fontSize: 9, fontWeight: "700" },
  hotSym: { fontSize: 13, fontWeight: "700" },
  hotPrice: { fontSize: 12, fontWeight: "600", marginBottom: 6 },

  miniTabs: { flexDirection: "row", borderRadius: 10, padding: 3, marginBottom: 12, gap: 2 },
  miniTab: { flex: 1, paddingVertical: 7, alignItems: "center", borderRadius: 8 },
  miniTabText: { fontSize: 11, fontWeight: "700" },
  marketCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  marketColHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  colLabel: { fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  marketRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 11 },
  coinLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  coinCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  coinLetter: { fontSize: 14, fontWeight: "800" },
  coinSym: { fontSize: 13, fontWeight: "700" },
  coinQuote: { fontSize: 10, marginTop: 1 },
  coinPrice: { fontSize: 13, fontWeight: "600" },
  chgPill: { paddingVertical: 5, borderRadius: 6, alignItems: "center" },
  chgText: { fontSize: 12, fontWeight: "700" },

  footer: { paddingHorizontal: 16, marginBottom: 8, alignItems: "center" },
  footerBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  footerText: { fontSize: 10 },
});
