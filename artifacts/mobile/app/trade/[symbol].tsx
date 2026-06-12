import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { usePrices } from "@/hooks/usePrices";
import { useFavorites } from "@/hooks/useFavorites";
import { apiFetch, apiPost } from "@/hooks/useApi";
import { AnimatedPrice } from "@/components/AnimatedPrice";
import { CandleChart } from "@/components/CandleChart";
import { PriceChange } from "@/components/PriceChange";

interface OrderBookEntry { price: number; qty: number; total?: number }
interface OrderBook { bids: OrderBookEntry[]; asks: OrderBookEntry[] }
interface OpenOrder { id: number; side: string; type: string; amount: number; price?: number; filled: number; status: string }
interface Trade { id: number; price: number; qty: number; side: string; time: string }

type OrderType = "limit" | "market" | "stop";
type Side = "buy" | "sell";
type TabKey = "orderbook" | "trades" | "myorders";

const COIN_COLORS: Record<string, string> = {
  BTC: "#f7931a", ETH: "#627eea", BNB: "#f3ba2f", SOL: "#9945ff",
  XRP: "#346aa9", ADA: "#3cc8c8", MATIC: "#8247e5", AVAX: "#e84142",
  DOGE: "#c2a633", NEAR: "#00c08b", LINK: "#2a5ada", DOT: "#e6007a",
  DEFAULT: "#6b7a9e",
};

export default function TradeSymbolScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { priceMap } = usePrices();
  const { isFav, toggle } = useFavorites();

  const base = symbol?.replace(/USDT$|INR$/, "") ?? "BTC";
  const quote = symbol?.includes("INR") ? "INR" : "USDT";
  const tick = priceMap[base.toUpperCase()];
  const price = quote === "INR" ? (tick?.inr ?? 0) : (tick?.usdt ?? 0);
  const change24h = tick?.change24h ?? 0;
  const high24h = price * (1 + Math.abs(change24h) / 100 + 0.005);
  const low24h = price * (1 - Math.abs(change24h) / 100 - 0.003);
  const vol24h = tick?.volume24h ?? 0;
  const coinColor = COIN_COLORS[base.toUpperCase()] ?? COIN_COLORS.DEFAULT;
  const favKey = base.toUpperCase();

  const [side, setSide] = useState<Side>("buy");
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [amount, setAmount] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [pct, setPct] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("orderbook");

  useEffect(() => {
    if (price > 0 && !limitPrice) setLimitPrice(price.toFixed(price < 1 ? 4 : 2));
  }, [price]);

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const { data: bookData } = useQuery({
    queryKey: ["orderbook", base, quote],
    queryFn: () => apiFetch<OrderBook>(`/api/exchange/orderbook/${base}/${quote}`),
    refetchInterval: 2000,
  });

  const { data: recentTrades } = useQuery({
    queryKey: ["trades", base, quote],
    queryFn: () => apiFetch<Trade[]>(`/api/exchange/trades/${base}/${quote}`),
    refetchInterval: 3000,
    enabled: activeTab === "trades",
  });

  const { data: openOrders, refetch: refetchOrders } = useQuery({
    queryKey: ["openorders", base, quote],
    queryFn: () => apiFetch<OpenOrder[]>(`/api/exchange/order?status=open`),
    enabled: isAuthenticated && activeTab === "myorders",
  });

  const placeMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/api/exchange/order", body),
    onSuccess: () => {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAmount("");
      setPct(null);
      void refetchOrders();
      void qc.invalidateQueries({ queryKey: ["wallet"] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/exchange/order/${id}`, { method: "DELETE" }),
    onSuccess: () => void refetchOrders(),
  });

  const handlePlace = () => {
    if (!isAuthenticated) { router.push("/login"); return; }
    const qty = parseFloat(amount);
    if (!qty || qty <= 0) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const body: Record<string, unknown> = { pair: `${base}/${quote}`, side, type: orderType, amount: qty };
    if (orderType === "limit") body.price = parseFloat(limitPrice);
    if (orderType === "stop") { body.price = parseFloat(limitPrice); body.stopPrice = parseFloat(stopPrice); }
    placeMutation.mutate(body);
  };

  const asks = (bookData?.asks ?? []).slice(0, 12);
  const bids = (bookData?.bids ?? []).slice(0, 12);
  const maxAskTotal = Math.max(...asks.map((e) => e.total ?? e.price * e.qty), 1);
  const maxBidTotal = Math.max(...bids.map((e) => e.total ?? e.price * e.qty), 1);

  const execPrice = orderType === "market" ? price : (parseFloat(limitPrice) || price);
  const totalEst = amount && price > 0 ? parseFloat(amount) * execPrice : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={[styles.coinBadge, { backgroundColor: coinColor + "25" }]}>
            <Text style={[styles.coinBadgeText, { color: coinColor }]}>{base.slice(0, 3)}</Text>
          </View>
          <View>
            <Text style={[styles.pairLabel, { color: colors.foreground }]}>{base}/{quote}</Text>
            <View style={styles.liveRow}>
              <View style={[styles.liveDot, { backgroundColor: "#22c55e" }]} />
              <PriceChange value={change24h} fontSize={11} />
            </View>
          </View>
        </View>
        <AnimatedPrice
          price={price}
          format={(p) => `${quote === "INR" ? "₹" : "$"}${p.toLocaleString("en-US", { maximumFractionDigits: p < 1 ? 6 : 2 })}`}
          style={{ color: change24h >= 0 ? colors.success : colors.destructive, fontSize: 16, fontWeight: "900" }}
        />
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            toggle(favKey);
          }}
        >
          <Feather name="star" size={20} color={isFav(favKey) ? "#f59e0b" : colors.mutedForeground} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/orders")} style={styles.iconBtn}>
          <Feather name="list" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* 24h stats bar */}
      <View style={[styles.statsBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {[
          { label: "24h High", value: `${quote === "INR" ? "₹" : "$"}${high24h.toLocaleString("en-US", { maximumFractionDigits: 2 })}`, color: colors.success },
          { label: "24h Low", value: `${quote === "INR" ? "₹" : "$"}${low24h.toLocaleString("en-US", { maximumFractionDigits: 2 })}`, color: colors.destructive },
          { label: "Vol(24h)", value: vol24h > 0 ? `${(vol24h / 1e6).toFixed(1)}M` : "—", color: colors.foreground },
          { label: "Mkt Cap", value: `$${((price * 21e6) / 1e9).toFixed(0)}B`, color: colors.mutedForeground },
        ].map((s) => (
          <View key={s.label} style={styles.statItem}>
            <Text style={[styles.statVal, { color: s.color }]}>{s.value}</Text>
            <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: botPt + 20 }}>
        {/* Chart */}
        <View style={[styles.chartCard, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
          <CandleChart symbol={base} height={210} />
        </View>

        {/* Order book + form */}
        <View style={styles.tradeRow}>
          {/* Left: order book panel */}
          <View style={[styles.bookPanel, { borderRightColor: colors.border, borderRightWidth: StyleSheet.hairlineWidth }]}>
            {/* Book tabs */}
            <View style={[styles.bookTabs, { borderBottomColor: colors.border }]}>
              {(["orderbook", "trades", "myorders"] as TabKey[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.bookTab, t === activeTab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                  onPress={() => setActiveTab(t)}
                >
                  <Text style={[styles.bookTabLabel, { color: t === activeTab ? colors.primary : colors.mutedForeground }]}>
                    {t === "orderbook" ? "Book" : t === "trades" ? "Trades" : "Mine"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {activeTab === "orderbook" && (
              <View>
                <View style={styles.bookColHdr}>
                  <Text style={[styles.bookColLabel, { color: colors.mutedForeground }]}>Price</Text>
                  <Text style={[styles.bookColLabel, { color: colors.mutedForeground, textAlign: "right" }]}>Qty</Text>
                </View>
                {[...asks].reverse().filter(a => a && typeof a.price === "number").map((a, i) => (
                  <TouchableOpacity key={i} style={styles.bookRow} onPress={() => setLimitPrice(a.price.toFixed(a.price < 1 ? 4 : 2))}>
                    <View style={[styles.depthBar, { width: `${Math.min(100, ((a.total ?? a.price * a.qty) / maxAskTotal) * 100)}%`, backgroundColor: "#e8151510" }]} />
                    <Text style={[styles.bookPrice, { color: colors.destructive }]}>{a.price.toFixed(a.price < 1 ? 4 : 2)}</Text>
                    <Text style={[styles.bookQty, { color: colors.foreground }]}>{a.qty.toFixed(3)}</Text>
                  </TouchableOpacity>
                ))}
                <View style={[styles.midPrice, { borderColor: colors.border }]}>
                  <AnimatedPrice
                    price={price}
                    format={(p) => p.toFixed(p < 1 ? 6 : 2)}
                    style={{ color: change24h >= 0 ? colors.success : colors.destructive, fontSize: 13, fontWeight: "800" }}
                  />
                </View>
                {bids.filter(b => b && typeof b.price === "number").map((b, i) => (
                  <TouchableOpacity key={i} style={styles.bookRow} onPress={() => setLimitPrice(b.price.toFixed(b.price < 1 ? 4 : 2))}>
                    <View style={[styles.depthBar, { width: `${Math.min(100, ((b.total ?? b.price * b.qty) / maxBidTotal) * 100)}%`, backgroundColor: "#22c55e10" }]} />
                    <Text style={[styles.bookPrice, { color: colors.success }]}>{b.price.toFixed(b.price < 1 ? 4 : 2)}</Text>
                    <Text style={[styles.bookQty, { color: colors.foreground }]}>{b.qty.toFixed(3)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {activeTab === "trades" && (
              <View>
                <View style={styles.bookColHdr}>
                  <Text style={[styles.bookColLabel, { color: colors.mutedForeground }]}>Price</Text>
                  <Text style={[styles.bookColLabel, { color: colors.mutedForeground, textAlign: "right" }]}>Qty</Text>
                </View>
                {(recentTrades ?? []).slice(0, 22).map((t, i) => (
                  <View key={i} style={styles.bookRow}>
                    <Text style={[styles.bookPrice, { color: t.side === "buy" ? colors.success : colors.destructive }]}>
                      {t.price.toFixed(2)}
                    </Text>
                    <Text style={[styles.bookQty, { color: colors.foreground }]}>{t.qty.toFixed(3)}</Text>
                  </View>
                ))}
              </View>
            )}

            {activeTab === "myorders" && (
              <View>
                {!isAuthenticated ? (
                  <TouchableOpacity style={styles.loginPrompt} onPress={() => router.push("/login")}>
                    <Feather name="lock" size={14} color={colors.primary} />
                    <Text style={[styles.loginPromptText, { color: colors.primary }]}>Login to see orders</Text>
                  </TouchableOpacity>
                ) : (openOrders ?? []).length === 0 ? (
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No open orders</Text>
                ) : (
                  (openOrders ?? []).map((o) => (
                    <View key={o.id} style={[styles.myOrderRow, { borderBottomColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.myOrderSide, { color: o.side === "buy" ? colors.success : colors.destructive }]}>
                          {o.side.toUpperCase()} {o.type}
                        </Text>
                        <Text style={[styles.myOrderDetail, { color: colors.mutedForeground }]}>
                          {o.amount.toFixed(3)} @ {o.price?.toFixed(2) ?? "mkt"}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => cancelMutation.mutate(o.id)} style={styles.cancelBtn}>
                        <Feather name="x" size={14} color={colors.destructive} />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>

          {/* Right: Order form */}
          <View style={styles.formPanel}>
            {/* Side toggle */}
            <View style={[styles.sideToggle, { backgroundColor: colors.muted }]}>
              <TouchableOpacity
                style={[styles.sideBtn, side === "buy" && { backgroundColor: colors.success }]}
                onPress={() => setSide("buy")}
              >
                <Text style={[styles.sideBtnLabel, { color: side === "buy" ? "#fff" : colors.mutedForeground }]}>Buy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sideBtn, side === "sell" && { backgroundColor: colors.destructive }]}
                onPress={() => setSide("sell")}
              >
                <Text style={[styles.sideBtnLabel, { color: side === "sell" ? "#fff" : colors.mutedForeground }]}>Sell</Text>
              </TouchableOpacity>
            </View>

            {/* Order type */}
            <View style={[styles.typeRow, { backgroundColor: colors.muted }]}>
              {(["limit", "market", "stop"] as OrderType[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeBtn, orderType === t && { backgroundColor: colors.card }]}
                  onPress={() => setOrderType(t)}
                >
                  <Text style={[styles.typeBtnLabel, { color: orderType === t ? colors.foreground : colors.mutedForeground }]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Stop price (only for stop orders) */}
            {orderType === "stop" && (
              <View style={[styles.inputRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={[styles.inputLbl, { color: colors.mutedForeground }]}>Stop</Text>
                <TextInput
                  style={[styles.orderInput, { color: colors.foreground }]}
                  value={stopPrice}
                  onChangeText={setStopPrice}
                  keyboardType="decimal-pad"
                  placeholder={price.toFixed(2)}
                  placeholderTextColor={colors.mutedForeground}
                />
                <Text style={[styles.inputUnit, { color: colors.mutedForeground }]}>{quote}</Text>
              </View>
            )}

            {/* Limit price */}
            {(orderType === "limit" || orderType === "stop") && (
              <View style={[styles.inputRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={[styles.inputLbl, { color: colors.mutedForeground }]}>Px</Text>
                <TextInput
                  style={[styles.orderInput, { color: colors.foreground }]}
                  value={limitPrice}
                  onChangeText={setLimitPrice}
                  keyboardType="decimal-pad"
                  placeholder={price.toFixed(2)}
                  placeholderTextColor={colors.mutedForeground}
                />
                <Text style={[styles.inputUnit, { color: colors.mutedForeground }]}>{quote}</Text>
              </View>
            )}

            {/* Amount */}
            <View style={[styles.inputRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Text style={[styles.inputLbl, { color: colors.mutedForeground }]}>Qty</Text>
              <TextInput
                style={[styles.orderInput, { color: colors.foreground }]}
                value={amount}
                onChangeText={(v) => { setAmount(v); setPct(null); }}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
              />
              <Text style={[styles.inputUnit, { color: colors.mutedForeground }]}>{base}</Text>
            </View>

            {/* Quick % */}
            <View style={styles.pctRow}>
              {[25, 50, 75, 100].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.pctBtn, { borderColor: colors.border }, pct === p && { borderColor: colors.primary, backgroundColor: colors.primary + "20" }]}
                  onPress={() => { setPct(p); setAmount(""); }}
                >
                  <Text style={[styles.pctLabel, { color: pct === p ? colors.primary : colors.mutedForeground }]}>{p}%</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Total */}
            {totalEst > 0 && (
              <Text style={[styles.totalEst, { color: colors.mutedForeground }]}>
                ≈ {quote === "INR" ? "₹" : "$"}{totalEst.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </Text>
            )}

            {/* Place button */}
            <TouchableOpacity
              style={[styles.placeBtn, { backgroundColor: side === "buy" ? colors.success : colors.destructive }, placeMutation.isPending && { opacity: 0.6 }]}
              onPress={handlePlace}
              disabled={placeMutation.isPending}
              activeOpacity={0.85}
            >
              {placeMutation.isPending
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.placeBtnLabel}>{side === "buy" ? "Buy" : "Sell"} {base}</Text>}
            </TouchableOpacity>

            {placeMutation.isSuccess && (
              <View style={[styles.feedback, { backgroundColor: "#22c55e18" }]}>
                <Feather name="check-circle" size={11} color="#22c55e" />
                <Text style={[styles.feedbackText, { color: "#22c55e" }]}>Order placed!</Text>
              </View>
            )}
            {placeMutation.isError && (
              <View style={[styles.feedback, { backgroundColor: "#e8151518" }]}>
                <Feather name="alert-circle" size={11} color="#e81515" />
                <Text style={[styles.feedbackText, { color: "#e81515" }]} numberOfLines={2}>
                  {(placeMutation.error as Error).message}
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  coinBadge: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  coinBadgeText: { fontSize: 12, fontWeight: "800" },
  pairLabel: { fontSize: 14, fontWeight: "800" },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  liveDot: { width: 5, height: 5, borderRadius: 3 },
  statsBar: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  statItem: { flex: 1 },
  statVal: { fontSize: 11, fontWeight: "700" },
  statLbl: { fontSize: 9, marginTop: 1 },
  chartCard: {},
  tradeRow: { flexDirection: "row" },
  bookPanel: { flex: 1 },
  bookTabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  bookTab: { flex: 1, paddingVertical: 8, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  bookTabLabel: { fontSize: 11, fontWeight: "700" },
  bookColHdr: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 4 },
  bookColLabel: { fontSize: 9, fontWeight: "600", textTransform: "uppercase" },
  bookRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 2.5, position: "relative" },
  depthBar: { position: "absolute", right: 0, top: 0, bottom: 0 },
  bookPrice: { fontSize: 11, fontWeight: "600", zIndex: 1 },
  bookQty: { fontSize: 11, zIndex: 1 },
  midPrice: { flexDirection: "row", justifyContent: "center", paddingVertical: 5, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, marginVertical: 2 },
  myOrderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  myOrderSide: { fontSize: 11, fontWeight: "700" },
  myOrderDetail: { fontSize: 10, marginTop: 1 },
  cancelBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  loginPrompt: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 16 },
  loginPromptText: { fontSize: 12, fontWeight: "600" },
  emptyText: { padding: 16, fontSize: 12, textAlign: "center" },
  formPanel: { width: 152, padding: 8, gap: 6 },
  sideToggle: { flexDirection: "row", borderRadius: 7, padding: 2, gap: 2 },
  sideBtn: { flex: 1, paddingVertical: 7, borderRadius: 5, alignItems: "center" },
  sideBtnLabel: { fontSize: 12, fontWeight: "800" },
  typeRow: { flexDirection: "row", borderRadius: 7, padding: 2, gap: 2 },
  typeBtn: { flex: 1, paddingVertical: 5, borderRadius: 5, alignItems: "center" },
  typeBtnLabel: { fontSize: 9, fontWeight: "700" },
  inputRow: { flexDirection: "row", alignItems: "center", borderRadius: 7, borderWidth: 1, paddingHorizontal: 6, height: 36, gap: 4 },
  inputLbl: { fontSize: 9, fontWeight: "700", width: 22 },
  orderInput: { flex: 1, fontSize: 12 },
  inputUnit: { fontSize: 9, fontWeight: "700", width: 30, textAlign: "right" },
  pctRow: { flexDirection: "row", gap: 3 },
  pctBtn: { flex: 1, paddingVertical: 3, borderRadius: 4, borderWidth: 1, alignItems: "center" },
  pctLabel: { fontSize: 9, fontWeight: "700" },
  totalEst: { fontSize: 10, textAlign: "center" },
  placeBtn: { height: 42, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  placeBtnLabel: { color: "#fff", fontSize: 12, fontWeight: "900" },
  feedback: { flexDirection: "row", alignItems: "center", padding: 6, borderRadius: 5, gap: 4 },
  feedbackText: { fontSize: 10, fontWeight: "600", flex: 1 },
});
