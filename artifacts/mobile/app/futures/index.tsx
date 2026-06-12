import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { usePrices } from "@/hooks/usePrices";
import { useGoFuturesWs } from "@/hooks/useGoFuturesWs";
import { apiPost, apiFetch } from "@/hooks/useApi";
import { AnimatedPrice } from "@/components/AnimatedPrice";
import { SparkLine } from "@/components/SparkLine";
import { GoDepth } from "@/components/GoDepth";

const FUTURES_COINS = ["BTC","ETH","SOL","BNB","XRP","AVAX","ADA","DOT","LINK","DOGE","MATIC","NEAR"];
const COIN_COLORS: Record<string, string> = {
  BTC:"#f7931a",ETH:"#627eea",BNB:"#f3ba2f",XRP:"#346aa9",
  SOL:"#9945ff",ADA:"#3cc8c8",MATIC:"#8247e5",AVAX:"#e84142",
  DOT:"#e6007a",LINK:"#2a5ada",DOGE:"#c2a633",NEAR:"#00c08b",DEFAULT:"#6b7a9e",
};
const LEVERAGES = [5,10,20,25,50,100];
type OrderTab = "order" | "depth" | "positions";

function genSparkData(price: number, change24h: number, symbol: string, n = 20): number[] {
  let seed = symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const rng = () => { seed = (seed*9301+49297)%233280; return seed/233280; };
  const start = price/(1+change24h/100);
  const pts: number[] = [];
  for (let i=0;i<n;i++){
    const t=i/(n-1);
    pts.push(Math.max(start+start*(change24h/100)*t+(rng()-0.5)*start*0.012,1e-8));
  }
  pts[n-1]=price; return pts;
}

interface FuturesPair { id: number; symbol: string; baseSymbol: string; quoteSymbol: string }
interface Position { id: number; symbol: string; side: string; size: number; entryPrice: number; leverage: number; liquidationPrice: number; unrealizedPnl: number }

export default function FuturesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { ticks, priceMap } = usePrices();

  const [selected, setSelected] = useState<string>("BTC");
  const [side, setSide] = useState<"long"|"short">("long");
  const [leverage, setLeverage] = useState(10);
  const [showRiskGate, setShowRiskGate] = useState(false);
  const [pendingLeverage, setPendingLeverage] = useState<number | null>(null);
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("zebvix_futures_risk_ack_v1").then((v) => {
      if (v === "true") setRiskAcknowledged(true);
    });
  }, []);
  const [margin, setMargin] = useState("");
  const [orderTab, setOrderTab] = useState<OrderTab>("order");
  const [orderType, setOrderType] = useState<"market"|"limit">("market");
  const [limitPrice, setLimitPrice] = useState("");

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const { data: pairsData } = useQuery({
    queryKey: ["futures-pairs"],
    queryFn: () => apiFetch<{ pairs: FuturesPair[] }>("/api/futures/market"),
    staleTime: 60_000,
  });

  const currentPair = useMemo(() =>
    pairsData?.pairs?.find((p) => p.baseSymbol === selected || p.symbol === `${selected}USDT`),
    [pairsData, selected]
  );

  const { bids, asks, trades, connected, lastPrice: wsPrice } = useGoFuturesWs(currentPair?.id ?? null);

  const { data: posData, isLoading: posLoading } = useQuery({
    queryKey: ["futures-positions"],
    queryFn: () => apiFetch<{ positions: Position[] }>("/api/futures/position"),
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });

  const pairs = useMemo(() =>
    FUTURES_COINS.map((sym) => ticks.find((t) => t.symbol === sym)).filter(Boolean) as typeof ticks,
    [ticks]
  );

  const tick = priceMap[selected];
  const price = wsPrice > 0 ? wsPrice : (tick?.usdt ?? 0);
  const change24h = tick?.change24h ?? 0;
  const execPrice = orderType === "limit" && limitPrice ? parseFloat(limitPrice) : price;
  const positionSize = margin ? parseFloat(margin) * leverage : 0;
  const liquidation = execPrice > 0
    ? side === "long"
      ? execPrice*(1-1/leverage*0.9)
      : execPrice*(1+1/leverage*0.9)
    : 0;

  const orderMutation = useMutation({
    mutationFn: (body: object) => apiPost("/api/futures/order", body),
    onSuccess: () => {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMargin(""); setLimitPrice("");
      void qc.invalidateQueries({ queryKey: ["futures-positions"] });
    },
  });

  const selColor = COIN_COLORS[selected] ?? COIN_COLORS.DEFAULT;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{selected}-PERP</Text>
          <View style={styles.headerMeta}>
            <AnimatedPrice
              price={price}
              format={(p) => `$${p.toLocaleString("en-US",{maximumFractionDigits:2})}`}
              style={{ fontSize:14, fontWeight:"800", color: change24h>=0?"#0ECB81":"#F6465D" }}
            />
            <View style={[styles.changePill, { backgroundColor: change24h>=0?"#0ECB8118":"#F6465D18" }]}>
              <Text style={[styles.changeText, { color: change24h>=0?"#0ECB81":"#F6465D" }]}>
                {change24h>=0?"+":""}{change24h.toFixed(2)}%
              </Text>
            </View>
            {connected && <View style={styles.liveIndicator}><View style={[styles.liveDot,{backgroundColor:"#0ECB81"}]}/><Text style={styles.liveText}>LIVE</Text></View>}
          </View>
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.push("/orders")}>
          <Feather name="list" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {/* Left pair list */}
        <View style={[styles.pairList, { borderRightColor: colors.border, backgroundColor: colors.card }]}>
          <View style={[styles.pairListHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.pairListTitle, { color: colors.mutedForeground }]}>PERP</Text>
          </View>
          <FlatList
            data={pairs}
            keyExtractor={(t) => t.symbol}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: t }) => {
              const bg = COIN_COLORS[t.symbol] ?? COIN_COLORS.DEFAULT;
              const sel = t.symbol === selected;
              return (
                <TouchableOpacity
                  style={[styles.pairRow, { borderBottomColor: colors.border }, sel && { backgroundColor: colors.primary+"18" }]}
                  onPress={() => { setSelected(t.symbol); setMargin(""); setLimitPrice(""); }}
                >
                  <View style={[styles.pairDot, { backgroundColor: bg }]} />
                  <View style={{ flex:1, minWidth:0 }}>
                    <Text style={[styles.pairSym, { color: sel ? colors.primary : colors.foreground }]} numberOfLines={1}>{t.symbol}</Text>
                    <Text style={[styles.pairChange, { color: t.change24h>=0?"#0ECB81":"#F6465D" }]}>
                      {t.change24h>=0?"+":""}{t.change24h.toFixed(1)}%
                    </Text>
                  </View>
                  <SparkLine data={genSparkData(t.usdt,t.change24h,t.symbol)} width={32} height={18} positive={t.change24h>=0} id={`f${t.symbol}`} />
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {/* Right panel */}
        <View style={{ flex:1 }}>
          {/* Inner tab bar */}
          <View style={[styles.innerTabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            {([["order","Order"],["depth","Depth"],["positions","Positions"]] as const).map(([key,label]) => (
              <TouchableOpacity
                key={key}
                style={[styles.innerTab, orderTab===key && { borderBottomColor: colors.primary, borderBottomWidth:2 }]}
                onPress={() => setOrderTab(key)}
              >
                <Text style={[styles.innerTabLabel, { color: orderTab===key ? colors.primary : colors.mutedForeground }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {orderTab === "depth" && (
            <ScrollView contentContainerStyle={{ padding:12, paddingBottom:botPt+20 }}>
              <Text style={[styles.depthHeading, { color: colors.foreground }]}>Live Orderbook</Text>
              {bids.length === 0 && asks.length === 0 ? (
                <View style={styles.depthEmpty}>
                  {currentPair ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Text style={{ color: colors.mutedForeground, fontSize:12 }}>Select a pair with active futures trading</Text>
                  )}
                </View>
              ) : (
                <>
                  <View style={[styles.depthCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.depthHeaders}>
                      <Text style={[styles.depthHdr, { color: colors.mutedForeground }]}>Price (USDT)</Text>
                      <Text style={[styles.depthHdr, { color: colors.mutedForeground }]}>Size</Text>
                      <Text style={[styles.depthHdr, { color: colors.mutedForeground }]}>Total</Text>
                    </View>
                    {asks.slice(0,8).reverse().map((a,i) => {
                      const maxQ = Math.max(...asks.slice(0,8).map(x=>x.qty),0.001);
                      const pct = (a.qty/maxQ)*100;
                      return (
                        <View key={i} style={styles.depthRow}>
                          <View style={[styles.depthBar,{backgroundColor:"#F6465D10",width:`${pct}%`}]}/>
                          <Text style={[styles.depthPrice,{color:"#F6465D"}]}>{a.price.toFixed(2)}</Text>
                          <Text style={[styles.depthQty,{color:colors.foreground}]}>{a.qty.toFixed(4)}</Text>
                          <Text style={[styles.depthQty,{color:colors.mutedForeground}]}>{(a.price*a.qty).toFixed(0)}</Text>
                        </View>
                      );
                    })}
                    <View style={[styles.spreadRow, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
                      <Text style={[styles.spreadLabel, { color: colors.mutedForeground }]}>Last: </Text>
                      <Text style={[styles.spreadPrice, { color: "#eb9100" }]}>${price > 0 ? price.toFixed(2) : "—"}</Text>
                    </View>
                    {bids.slice(0,8).map((b,i) => {
                      const maxQ = Math.max(...bids.slice(0,8).map(x=>x.qty),0.001);
                      const pct = (b.qty/maxQ)*100;
                      return (
                        <View key={i} style={styles.depthRow}>
                          <View style={[styles.depthBar,{backgroundColor:"#0ECB8110",width:`${pct}%`}]}/>
                          <Text style={[styles.depthPrice,{color:"#0ECB81"}]}>{b.price.toFixed(2)}</Text>
                          <Text style={[styles.depthQty,{color:colors.foreground}]}>{b.qty.toFixed(4)}</Text>
                          <Text style={[styles.depthQty,{color:colors.mutedForeground}]}>{(b.price*b.qty).toFixed(0)}</Text>
                        </View>
                      );
                    })}
                  </View>

                  {trades.length > 0 && (
                    <View style={[styles.depthCard, { backgroundColor: colors.card, borderColor: colors.border, marginTop:12 }]}>
                      <Text style={[styles.depthHeading, { color: colors.foreground, marginBottom:8 }]}>Recent Trades</Text>
                      {trades.slice(0,12).map((t,i) => (
                        <View key={i} style={styles.tradeRow}>
                          <Text style={[styles.depthPrice,{color:t.side==="buy"?"#0ECB81":"#F6465D"}]}>{t.price.toFixed(2)}</Text>
                          <Text style={[styles.depthQty,{color:colors.foreground}]}>{t.qty.toFixed(4)}</Text>
                          <Text style={[styles.depthQty,{color:colors.mutedForeground}]}>{new Date(t.ts).toLocaleTimeString()}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          )}

          {orderTab === "positions" && (
            <ScrollView contentContainerStyle={{ padding:12, paddingBottom:botPt+20 }}>
              {!isAuthenticated ? (
                <View style={styles.authBox}>
                  <Feather name="lock" size={24} color={colors.mutedForeground} />
                  <Text style={{ color: colors.mutedForeground, marginTop:8, textAlign:"center" }}>Login to view positions</Text>
                  <TouchableOpacity style={[styles.loginBtn,{backgroundColor:colors.primary}]} onPress={() => router.push("/login")}>
                    <Text style={styles.loginBtnLabel}>Login</Text>
                  </TouchableOpacity>
                </View>
              ) : posLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop:40 }} />
              ) : (posData?.positions ?? []).length === 0 ? (
                <View style={styles.authBox}>
                  <Feather name="trending-up" size={24} color={colors.mutedForeground} />
                  <Text style={{ color:colors.mutedForeground,marginTop:8,textAlign:"center" }}>No open positions</Text>
                </View>
              ) : (
                (posData?.positions ?? []).map((p) => {
                  const pnlColor = (p.unrealizedPnl??0)>=0?"#0ECB81":"#F6465D";
                  return (
                    <View key={p.id} style={[styles.posCard,{backgroundColor:colors.card,borderColor:colors.border}]}>
                      <View style={styles.posTop}>
                        <View style={styles.posLeft}>
                          <Text style={[styles.posSym,{color:colors.foreground}]}>{p.symbol}</Text>
                          <View style={[styles.posSidePill,{backgroundColor:p.side==="buy"?"#0ECB8120":"#F6465D20"}]}>
                            <Text style={[styles.posSideLabel,{color:p.side==="buy"?"#0ECB81":"#F6465D"}]}>
                              {p.side==="buy"?"Long":"Short"} {p.leverage}x
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.posPnl,{color:pnlColor}]}>
                          {(p.unrealizedPnl??0)>=0?"+":""}{(p.unrealizedPnl??0).toFixed(2)} USDT
                        </Text>
                      </View>
                      <View style={styles.posStats}>
                        {[
                          {l:"Size",v:`${p.size}`},
                          {l:"Entry",v:`$${(p.entryPrice??0).toFixed(2)}`},
                          {l:"Liq.",v:`$${(p.liquidationPrice??0).toFixed(2)}`},
                        ].map((s)=>(
                          <View key={s.l} style={styles.posStat}>
                            <Text style={[styles.posStatLabel,{color:colors.mutedForeground}]}>{s.l}</Text>
                            <Text style={[styles.posStatVal,{color:colors.foreground}]}>{s.v}</Text>
                          </View>
                        ))}
                      </View>
                      <View style={styles.posActRow}>
                        <TouchableOpacity
                          style={[styles.posCloseBtn, { backgroundColor: "#F6465D20", borderColor: "#F6465D50" }]}
                          onPress={async () => {
                            try {
                              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              const parts = (p.symbol||"").match(/^([A-Z]+?)(USDT|BTC|ETH|BNB)$/);
                              await apiFetch("/api/futures/position", {
                                method: "DELETE",
                                body: JSON.stringify({ currency: parts?.[2] ?? "USDT", pair: parts?.[1] ?? p.symbol, side: p.side }),
                              });
                              void qc.invalidateQueries({ queryKey: ["futures-positions"] });
                              router.push(`/futures-invoice/${p.id}` as any);
                            } catch { /* ignore */ }
                          }}
                        >
                          <Feather name="x-square" size={12} color="#F6465D" />
                          <Text style={[styles.posActLabel, { color: "#F6465D" }]}>Close</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.posCloseBtn, { backgroundColor: "#eb910015", borderColor: "#eb910050" }]}
                          onPress={() => router.push(`/futures-invoice/${p.id}` as any)}
                        >
                          <Feather name="file-text" size={12} color="#eb9100" />
                          <Text style={[styles.posActLabel, { color: "#eb9100" }]}>Invoice</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          )}

          {orderTab === "order" && (
            <ScrollView contentContainerStyle={{ padding:12, gap:10, paddingBottom:botPt+20 }}>
              {/* Order type */}
              <View style={[styles.typeRow, { backgroundColor: colors.muted }]}>
                {(["market","limit"] as const).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeBtn, orderType===t && { backgroundColor: colors.card }]}
                    onPress={() => setOrderType(t)}
                  >
                    <Text style={[styles.typeBtnLabel, { color: orderType===t ? colors.foreground : colors.mutedForeground }]}>
                      {t.charAt(0).toUpperCase()+t.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Side */}
              <View style={styles.sideRow}>
                <TouchableOpacity
                  style={[styles.sideBtn, { backgroundColor: side==="long"?"#0ECB81":colors.muted }]}
                  onPress={() => setSide("long")}
                >
                  <Feather name="trending-up" size={13} color={side==="long"?"#fff":colors.mutedForeground} />
                  <Text style={[styles.sideBtnLabel, { color: side==="long"?"#fff":colors.mutedForeground }]}>Long / Buy</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sideBtn, { backgroundColor: side==="short"?"#F6465D":colors.muted }]}
                  onPress={() => setSide("short")}
                >
                  <Feather name="trending-down" size={13} color={side==="short"?"#fff":colors.mutedForeground} />
                  <Text style={[styles.sideBtnLabel, { color: side==="short"?"#fff":colors.mutedForeground }]}>Short / Sell</Text>
                </TouchableOpacity>
              </View>

              {/* Limit price */}
              {orderType === "limit" && (
                <View>
                  <Text style={[styles.fieldLabel,{color:colors.mutedForeground}]}>Limit Price (USDT)</Text>
                  <View style={[styles.inputRow,{backgroundColor:colors.muted,borderColor:colors.border}]}>
                    <TextInput
                      style={[styles.input,{color:colors.foreground}]}
                      value={limitPrice}
                      onChangeText={setLimitPrice}
                      placeholder={price>0?price.toFixed(2):"0.00"}
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="decimal-pad"
                    />
                    <Text style={[styles.inputUnit,{color:colors.mutedForeground}]}>USDT</Text>
                  </View>
                </View>
              )}

              {/* Leverage */}
              <View>
                <View style={styles.levHeader}>
                  <Text style={[styles.fieldLabel,{color:colors.foreground}]}>Leverage</Text>
                  <View style={[styles.levBadge,{backgroundColor:colors.primary+"22"}]}>
                    <Text style={[styles.levBadgeText,{color:colors.primary}]}>{leverage}×</Text>
                  </View>
                </View>
                <View style={styles.levRow}>
                  {LEVERAGES.map((l)=>(
                    <TouchableOpacity
                      key={l}
                      style={[styles.levBtn,{borderColor:l===leverage?colors.primary:colors.border},l===leverage&&{backgroundColor:colors.primary+"20"}]}
                      onPress={()=>{
                        if (l >= 50 && !riskAcknowledged) {
                          setPendingLeverage(l);
                          setShowRiskGate(true);
                        } else {
                          setLeverage(l);
                        }
                      }}
                    >
                      <Text style={[styles.levLabel,{color:l===leverage?colors.primary:colors.mutedForeground}]}>{l}×</Text>
                      {l>=50&&<Text style={{fontSize:8,color:"#F6465D",fontWeight:"700"}}>HIGH</Text>}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Margin */}
              <View>
                <Text style={[styles.fieldLabel,{color:colors.foreground}]}>Margin (USDT)</Text>
                <View style={[styles.inputRow,{backgroundColor:colors.muted,borderColor:colors.border}]}>
                  <TextInput
                    style={[styles.input,{color:colors.foreground}]}
                    value={margin}
                    onChangeText={setMargin}
                    placeholder="0.00"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                  />
                  <Text style={[styles.inputUnit,{color:colors.mutedForeground}]}>USDT</Text>
                </View>
              </View>

              {/* Details */}
              {positionSize > 0 && (
                <View style={[styles.detailsBox,{backgroundColor:colors.muted,borderColor:colors.border}]}>
                  {[
                    {l:"Position Size",v:`$${positionSize.toFixed(2)}`},
                    {l:"Liq. Price",v:`$${liquidation.toFixed(2)}`,danger:true},
                    {l:"Margin Required",v:`$${margin}`},
                    {l:"Est. Fee (0.04%)",v:`$${(positionSize*0.0004).toFixed(4)}`},
                  ].map((d)=>(
                    <View key={d.l} style={styles.detailRow}>
                      <Text style={[styles.detailLabel,{color:colors.mutedForeground}]}>{d.l}</Text>
                      <Text style={[styles.detailVal,{color:d.danger?"#F6465D":colors.foreground}]}>{d.v}</Text>
                    </View>
                  ))}
                </View>
              )}

              {orderMutation.isSuccess && (
                <View style={[styles.msgBox,{backgroundColor:"#0ECB8120"}]}>
                  <Feather name="check-circle" size={14} color="#0ECB81"/>
                  <Text style={{color:"#0ECB81",fontSize:13,fontWeight:"600"}}>Order placed successfully!</Text>
                </View>
              )}
              {orderMutation.isError && (
                <View style={[styles.msgBox,{backgroundColor:"#F6465D20"}]}>
                  <Feather name="alert-circle" size={14} color="#F6465D"/>
                  <Text style={{color:"#F6465D",fontSize:12,flex:1}} numberOfLines={2}>
                    {(orderMutation.error as Error).message}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.orderBtn,{backgroundColor:side==="long"?"#0ECB81":"#F6465D"},orderMutation.isPending&&{opacity:0.6}]}
                onPress={() => {
                  if (!isAuthenticated) { router.push("/login"); return; }
                  if (!margin||parseFloat(margin)<=0) return;
                  if (Platform.OS!=="web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  orderMutation.mutate({
                    symbol:selected, side:side==="long"?"buy":"sell",
                    leverage, amount:parseFloat(margin),
                    type:orderType,
                    price:orderType==="limit"&&limitPrice?parseFloat(limitPrice):undefined,
                  });
                }}
                disabled={orderMutation.isPending}
              >
                <Feather name={side==="long"?"trending-up":"trending-down"} size={16} color="#fff" />
                <Text style={styles.orderBtnLabel}>
                  {orderMutation.isPending?"Placing...":`${side==="long"?"Long":"Short"} ${leverage}× ${orderType==="market"?"Market":"Limit"}`}
                </Text>
              </TouchableOpacity>

              <Text style={[styles.risk,{color:colors.mutedForeground}]}>
                ⚠️ Perpetual futures carry significant risk of loss. Trade responsibly.
              </Text>
            </ScrollView>
          )}
        </View>
      </View>

      {/* Risk Gate Modal for high leverage */}
      {showRiskGate && (
        <View style={{...StyleSheet.absoluteFillObject,backgroundColor:"#000000cc",justifyContent:"center",alignItems:"center",zIndex:99}}>
          <View style={{width:"90%",backgroundColor:"#1a0505",borderRadius:20,borderWidth:1.5,borderColor:"#F6465D40",padding:24,gap:14}}>
            <View style={{alignItems:"center",gap:8}}>
              <View style={{width:60,height:60,borderRadius:30,backgroundColor:"#F6465D20",alignItems:"center",justifyContent:"center"}}>
                <Feather name="alert-triangle" size={28} color="#F6465D" />
              </View>
              <Text style={{fontSize:18,fontWeight:"800",color:"#f8fafc",textAlign:"center"}}>High Leverage Warning</Text>
              <Text style={{fontSize:13,color:"#9ba3af",textAlign:"center",lineHeight:20}}>
                {pendingLeverage}× leverage amplifies both gains AND losses. A 1% adverse move = {pendingLeverage}% loss on your margin.
              </Text>
            </View>
            <View style={{backgroundColor:"#F6465D10",borderRadius:12,borderWidth:1,borderColor:"#F6465D30",padding:14,gap:8}}>
              {[
                "Liquidation risk: your entire margin can be lost",
                "High volatility can trigger instant liquidation",
                "Only trade with funds you can afford to lose",
                "Use stop-losses to protect your position",
              ].map((w)=>(
                <View key={w} style={{flexDirection:"row",alignItems:"flex-start",gap:8}}>
                  <Feather name="x-circle" size={13} color="#F6465D" style={{marginTop:2}} />
                  <Text style={{flex:1,fontSize:12,color:"#f87171",lineHeight:18}}>{w}</Text>
                </View>
              ))}
            </View>
            <Text style={{fontSize:11,color:"#6b7a9e",textAlign:"center",lineHeight:16}}>
              This warning is shown once per Zebvix FIU-IND risk disclosure policy.
            </Text>
            <View style={{flexDirection:"row",gap:10}}>
              <TouchableOpacity
                style={{flex:1,paddingVertical:13,borderRadius:10,alignItems:"center",backgroundColor:"#1e293b",borderWidth:1,borderColor:"#334155"}}
                onPress={()=>{setShowRiskGate(false);setPendingLeverage(null);}}
              >
                <Text style={{color:"#94a3b8",fontWeight:"700"}}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{flex:1,paddingVertical:13,borderRadius:10,alignItems:"center",backgroundColor:"#F6465D"}}
                onPress={()=>{
                  if (pendingLeverage) setLeverage(pendingLeverage);
                  setRiskAcknowledged(true);
                  void AsyncStorage.setItem("zebvix_futures_risk_ack_v1","true");
                  setShowRiskGate(false);setPendingLeverage(null);
                }}
              >
                <Text style={{color:"#fff",fontWeight:"800"}}>I Understand — Proceed</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:{flex:1},
  header:{flexDirection:"row",alignItems:"center",paddingHorizontal:12,paddingBottom:10,borderBottomWidth:StyleSheet.hairlineWidth,gap:8},
  iconBtn:{width:36,height:36,alignItems:"center",justifyContent:"center"},
  headerCenter:{flex:1,alignItems:"center"},
  headerTitle:{fontSize:15,fontWeight:"800"},
  headerMeta:{flexDirection:"row",alignItems:"center",gap:6,marginTop:2},
  changePill:{paddingHorizontal:6,paddingVertical:2,borderRadius:4},
  changeText:{fontSize:11,fontWeight:"700"},
  liveIndicator:{flexDirection:"row",alignItems:"center",gap:3},
  liveDot:{width:6,height:6,borderRadius:3},
  liveText:{fontSize:9,fontWeight:"800",color:"#0ECB81"},
  body:{flex:1,flexDirection:"row"},
  pairList:{width:90,borderRightWidth:StyleSheet.hairlineWidth},
  pairListHeader:{paddingHorizontal:8,paddingVertical:6,borderBottomWidth:StyleSheet.hairlineWidth},
  pairListTitle:{fontSize:9,fontWeight:"700",textTransform:"uppercase"},
  pairRow:{flexDirection:"row",alignItems:"center",paddingHorizontal:6,paddingVertical:7,borderBottomWidth:StyleSheet.hairlineWidth,gap:4},
  pairDot:{width:5,height:5,borderRadius:2.5,flexShrink:0},
  pairSym:{fontSize:10,fontWeight:"700"},
  pairChange:{fontSize:9,fontWeight:"600"},
  innerTabs:{flexDirection:"row",borderBottomWidth:StyleSheet.hairlineWidth},
  innerTab:{flex:1,paddingVertical:10,alignItems:"center",borderBottomWidth:2,borderBottomColor:"transparent"},
  innerTabLabel:{fontSize:12,fontWeight:"700"},
  depthHeading:{fontSize:14,fontWeight:"700",marginBottom:10},
  depthEmpty:{padding:40,alignItems:"center",gap:8},
  depthCard:{borderRadius:10,borderWidth:1,overflow:"hidden",marginBottom:2},
  depthHeaders:{flexDirection:"row",paddingHorizontal:12,paddingVertical:6,gap:4},
  depthHdr:{flex:1,fontSize:10,fontWeight:"600",textTransform:"uppercase"},
  depthRow:{flexDirection:"row",paddingHorizontal:12,paddingVertical:4,gap:4,position:"relative"},
  depthBar:{...StyleSheet.absoluteFillObject,left:0},
  depthPrice:{flex:1,fontSize:11,fontWeight:"700",fontVariant:["tabular-nums"]},
  depthQty:{flex:1,fontSize:11,fontVariant:["tabular-nums"],textAlign:"right"},
  spreadRow:{flexDirection:"row",alignItems:"center",paddingHorizontal:12,paddingVertical:6,borderTopWidth:StyleSheet.hairlineWidth,borderBottomWidth:StyleSheet.hairlineWidth},
  spreadLabel:{fontSize:11,color:"#6b7a9e"},
  spreadPrice:{fontSize:13,fontWeight:"800"},
  tradeRow:{flexDirection:"row",paddingHorizontal:12,paddingVertical:3,gap:4},
  authBox:{padding:40,alignItems:"center",gap:8},
  loginBtn:{paddingHorizontal:20,paddingVertical:10,borderRadius:20,marginTop:8},
  loginBtnLabel:{color:"#fff",fontWeight:"700"},
  posCard:{borderRadius:12,borderWidth:1,padding:12,marginBottom:8},
  posTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:8},
  posLeft:{flexDirection:"row",alignItems:"center",gap:8},
  posSym:{fontSize:14,fontWeight:"700"},
  posSidePill:{paddingHorizontal:8,paddingVertical:3,borderRadius:6},
  posSideLabel:{fontSize:11,fontWeight:"700"},
  posPnl:{fontSize:14,fontWeight:"800"},
  posStats:{flexDirection:"row"},
  posStat:{flex:1},
  posStatLabel:{fontSize:10,textTransform:"uppercase"},
  posStatVal:{fontSize:12,fontWeight:"700",marginTop:2},
  posActRow:{flexDirection:"row",gap:8,marginTop:10},
  posCloseBtn:{flex:1,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:5,height:34,borderRadius:8,borderWidth:1},
  posActLabel:{fontSize:12,fontWeight:"700"},
  typeRow:{flexDirection:"row",borderRadius:8,padding:3,gap:2},
  typeBtn:{flex:1,paddingVertical:8,alignItems:"center",borderRadius:6},
  typeBtnLabel:{fontSize:13,fontWeight:"700"},
  sideRow:{flexDirection:"row",gap:8},
  sideBtn:{flex:1,flexDirection:"row",alignItems:"center",justifyContent:"center",paddingVertical:12,borderRadius:10,gap:6},
  sideBtnLabel:{fontSize:13,fontWeight:"800"},
  fieldLabel:{fontSize:12,fontWeight:"600",marginBottom:5},
  inputRow:{flexDirection:"row",alignItems:"center",borderRadius:10,borderWidth:1,paddingHorizontal:14,height:48,gap:8},
  input:{flex:1,fontSize:18,fontWeight:"700"},
  inputUnit:{fontSize:13},
  levHeader:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:6},
  levBadge:{paddingHorizontal:10,paddingVertical:3,borderRadius:6},
  levBadgeText:{fontSize:13,fontWeight:"800"},
  levRow:{flexDirection:"row",flexWrap:"wrap",gap:6},
  levBtn:{paddingHorizontal:10,paddingVertical:6,borderRadius:6,borderWidth:1},
  levLabel:{fontSize:12,fontWeight:"700"},
  detailsBox:{borderRadius:10,borderWidth:1,padding:12,gap:8},
  detailRow:{flexDirection:"row",justifyContent:"space-between"},
  detailLabel:{fontSize:12},
  detailVal:{fontSize:12,fontWeight:"700"},
  msgBox:{flexDirection:"row",alignItems:"center",padding:12,borderRadius:10,gap:8},
  orderBtn:{height:52,borderRadius:12,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8},
  orderBtnLabel:{color:"#fff",fontSize:15,fontWeight:"900"},
  risk:{fontSize:11,textAlign:"center",lineHeight:16},
});
