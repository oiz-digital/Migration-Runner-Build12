import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { usePrices } from "@/hooks/usePrices";
import { apiFetch } from "@/hooks/useApi";
import { CoinRowWithSpark } from "@/components/CoinRowWithSpark";
import { StatsBar } from "@/components/StatsBar";
import { AnimatedPrice } from "@/components/AnimatedPrice";
import { SparkLine } from "@/components/SparkLine";

const { width: SCREEN_W } = Dimensions.get("window");

interface WalletItem { symbol: string; balance: string; locked: string }
interface WalletResponse { wallets: WalletItem[] }

function genSparkData(price: number, change24h: number, symbol: string, n = 24): number[] {
  let seed = symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const rng = () => { seed=(seed*9301+49297)%233280; return seed/233280; };
  const start = price/(1+change24h/100);
  const pts: number[] = [];
  for (let i=0;i<n;i++){
    const t=i/(n-1);
    pts.push(Math.max(start+start*(change24h/100)*t+(rng()-0.5)*start*0.012,1e-8));
  }
  pts[n-1]=price; return pts;
}

const BANNERS = [
  { id:"1", title:"Trade Futures with up to 100× Leverage", sub:"Professional-grade perpetual contracts", color1:"#1a0825", color2:"#0d1524", icon:"trending-up" as const, accent:"#9945ff" },
  { id:"2", title:"Earn up to 28% APY on Staking", sub:"Fixed and flexible savings pools available", color1:"#001a0e", color2:"#0d1524", icon:"percent" as const, accent:"#0ECB81" },
  { id:"3", title:"Zero-Fee P2P Trading in INR", sub:"Buy & sell crypto directly with other traders", color1:"#1a1200", color2:"#0d1524", icon:"users" as const, accent:"#eb9100" },
  { id:"4", title:"AI-Powered Trading Plans", sub:"Let our AI manage your portfolio automatically", color1:"#0a0f1a", color2:"#0d1524", icon:"cpu" as const, accent:"#627eea" },
];

const QUICK_ACTIONS = [
  { label:"Spot", icon:"repeat" as const, route:"/trade", color:"#eb9100" },
  { label:"Futures", icon:"trending-up" as const, route:"/futures", color:"#9945ff" },
  { label:"Options", icon:"activity" as const, route:"/options", color:"#627eea" },
  { label:"Convert", icon:"arrow-right-circle" as const, route:"/convert", color:"#0ECB81" },
  { label:"P2P", icon:"users" as const, route:"/p2p", color:"#346aa9" },
  { label:"Earn", icon:"percent" as const, route:"/earn", color:"#f59e0b" },
  { label:"AI Trade", icon:"cpu" as const, route:"/ai-trading", color:"#627eea" },
  { label:"Bots", icon:"grid" as const, route:"/bots", color:"#eb9100" },
  { label:"Copy", icon:"copy" as const, route:"/copy-trading", color:"#e84142" },
  { label:"Portfolio", icon:"pie-chart" as const, route:"/portfolio", color:"#00c08b" },
  { label:"INR Pay", icon:"flag" as const, route:"/inr-payments", color:"#ff9933" },
  { label:"Discover", icon:"globe" as const, route:"/discover", color:"#9945ff" },
];

const COIN_COLORS: Record<string,string> = {
  BTC:"#f7931a",ETH:"#627eea",BNB:"#f3ba2f",XRP:"#346aa9",
  SOL:"#9945ff",ADA:"#3cc8c8",USDT:"#26a17b",MATIC:"#8247e5",
  AVAX:"#e84142",DOT:"#e6007a",LINK:"#2a5ada",DOGE:"#c2a633",
};

type MarketTab = "hot" | "gainers" | "losers";

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const { ticks, priceMap, inrRate } = usePrices();
  const [bannerIdx, setBannerIdx] = useState(0);
  const [marketTab, setMarketTab] = useState<MarketTab>("hot");
  const bannerRef = useRef<ScrollView>(null);

  const { data: walletData, isLoading, refetch } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => apiFetch<WalletResponse>("/api/finance/wallet"),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const totalInr = useMemo(() => {
    if (!walletData?.wallets) return 0;
    return walletData.wallets.reduce((sum, w) => {
      const bal = parseFloat(w.balance)||0;
      const tick = priceMap[w.symbol.toUpperCase()];
      if (w.symbol.toUpperCase()==="INR") return sum+bal;
      const px = tick?.inr??(tick?.usdt??0)*inrRate;
      return sum+bal*px;
    }, 0);
  }, [walletData, priceMap, inrRate]);

  const btcDom = useMemo(() => {
    const btc = priceMap["BTC"];
    if (!btc) return 0;
    const total = ticks.reduce((s,t)=>s+(t.usdt??0)*(t.volume24h??0),0);
    const btcVol = (btc.usdt??0)*(btc.volume24h??0);
    return total>0?(btcVol/total)*100:0;
  }, [ticks,priceMap]);

  const totalVol = useMemo(()=>ticks.reduce((s,t)=>s+(t.usdt??0)*(t.volume24h??0),0),[ticks]);

  const filtered = useMemo(() => {
    const base = ticks.filter((t)=>t.usdt>0&&t.symbol!=="USDT"&&t.symbol!=="INR");
    if (marketTab==="gainers") return [...base].sort((a,b)=>b.change24h-a.change24h).slice(0,15);
    if (marketTab==="losers") return [...base].sort((a,b)=>a.change24h-b.change24h).slice(0,15);
    return [...base].sort((a,b)=>(b.usdt*b.volume24h)-(a.usdt*a.volume24h)).slice(0,15);
  }, [ticks,marketTab]);

  const trending = useMemo(()=>
    [...ticks]
      .filter((t)=>t.usdt>0&&t.symbol!=="USDT"&&t.symbol!=="INR")
      .sort((a,b)=>(b.usdt*b.volume24h)-(a.usdt*a.volume24h))
      .slice(0,8),
    [ticks]
  );

  const btc = priceMap["BTC"];
  const eth = priceMap["ETH"];
  const sol = priceMap["SOL"];
  const bnb = priceMap["BNB"];

  const onRefresh = useCallback(()=>{ void refetch(); },[refetch]);
  const topPt = insets.top+(Platform.OS==="web"?67:0);
  const botPt = insets.bottom+(Platform.OS==="web"?34:0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topPt, paddingBottom: botPt+90 }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
              {user?`${new Date().getHours()<12?"Morning":"Evening"}, ${user.name.split(" ")[0]} 👋`:"Welcome to"}
            </Text>
            <Text style={[styles.brand, { color: colors.foreground }]}>Zebvix</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={[styles.iconBtn,{backgroundColor:colors.card,borderWidth:1,borderColor:colors.border}]} onPress={()=>router.push("/notifications" as any)}>
              <Feather name="bell" size={18} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.iconBtn,{backgroundColor:colors.primary}]} onPress={()=>router.push(isAuthenticated?"/(tabs)/profile":"/login")}>
              <Feather name="user" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Live ticker strip */}
        {(btc||eth||sol||bnb) && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tickerScroll} contentContainerStyle={styles.tickerContent}>
            {[
              btc&&{sym:"BTC",tick:btc,color:"#f7931a"},
              eth&&{sym:"ETH",tick:eth,color:"#627eea"},
              sol&&{sym:"SOL",tick:sol,color:"#9945ff"},
              bnb&&{sym:"BNB",tick:bnb,color:"#f3ba2f"},
            ].filter(Boolean).map((item:any)=>(
              <TouchableOpacity key={item.sym} style={[styles.tickerChip,{backgroundColor:colors.card,borderColor:colors.border}]} onPress={()=>router.push(`/trade/${item.sym}USDT` as any)}>
                <View style={[styles.tickerDot,{backgroundColor:item.color}]}/>
                <Text style={[styles.tickerSym,{color:colors.mutedForeground}]}>{item.sym}</Text>
                <AnimatedPrice price={item.tick.usdt} format={(p)=>`$${p.toLocaleString("en-US",{maximumFractionDigits:p<100?2:0})}`} style={{fontSize:13,fontWeight:"800",color:colors.foreground}}/>
                <Text style={[styles.tickerChange,{color:item.tick.change24h>=0?"#0ECB81":"#F6465D"}]}>
                  {item.tick.change24h>=0?"+":""}{item.tick.change24h.toFixed(2)}%
                </Text>
              </TouchableOpacity>
            ))}
            {totalVol>0&&(
              <View style={[styles.tickerChip,{backgroundColor:colors.card,borderColor:colors.border}]}>
                <Feather name="activity" size={11} color={colors.mutedForeground}/>
                <Text style={[styles.tickerSym,{color:colors.mutedForeground}]}>24h Vol</Text>
                <Text style={[styles.tickerVal,{color:colors.foreground}]}>${(totalVol/1e9).toFixed(1)}B</Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* Portfolio card */}
        <View style={styles.cardWrap}>
          <LinearGradient colors={["#1f1100","#0a1020"]} start={{x:0,y:0}} end={{x:1,y:1}} style={[styles.portfolioCard,{borderColor:"#2a1f00"}]}>
            <View style={styles.portTop}>
              <View style={{flex:1}}>
                <Text style={styles.portLabel}>Total Portfolio Value</Text>
                <AnimatedPrice
                  price={isAuthenticated?totalInr:0}
                  format={(p)=>isAuthenticated?`₹${p.toLocaleString("en-IN",{maximumFractionDigits:0})}`:"—"}
                  style={styles.portValue}
                />
                {isAuthenticated&&totalInr>0&&(
                  <Text style={styles.portSub}>≈ ${(totalInr/inrRate).toLocaleString("en-US",{maximumFractionDigits:2})}</Text>
                )}
              </View>
              <View style={styles.portActions}>
                <TouchableOpacity style={[styles.portBtn,{backgroundColor:colors.primary}]} onPress={()=>router.push(isAuthenticated?"/(tabs)/wallet":"/login")}>
                  <Feather name="plus" size={13} color="#fff"/>
                  <Text style={styles.portBtnLabel}>Deposit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.portBtn,{backgroundColor:"transparent",borderWidth:1,borderColor:colors.primary}]} onPress={()=>router.push(isAuthenticated?"/(tabs)/wallet":"/login")}>
                  <Feather name="arrow-up" size={13} color={colors.primary}/>
                  <Text style={[styles.portBtnLabel,{color:colors.primary}]}>Withdraw</Text>
                </TouchableOpacity>
              </View>
            </View>
            {!isAuthenticated&&(
              <TouchableOpacity style={styles.loginRow} onPress={()=>router.push("/login")}>
                <Feather name="lock" size={11} color="#6b7a9e"/>
                <Text style={styles.loginHint}>Login to view your balance</Text>
                <Feather name="chevron-right" size={11} color="#6b7a9e"/>
              </TouchableOpacity>
            )}
          </LinearGradient>
        </View>

        {/* Market stats */}
        {ticks.length>0&&(
          <StatsBar stats={[
            {label:"BTC Dom",value:`${btcDom.toFixed(1)}%`,valueColor:"#f7931a"},
            {label:"Coins",value:`${ticks.filter(t=>t.usdt>0).length}`},
            {label:"Gainers",value:`${ticks.filter(t=>t.change24h>0).length}`,valueColor:"#0ECB81"},
            {label:"Losers",value:`${ticks.filter(t=>t.change24h<0).length}`,valueColor:"#F6465D"},
          ]}/>
        )}

        {/* Quick actions */}
        <View style={styles.actionsGrid}>
          {QUICK_ACTIONS.map((a)=>(
            <TouchableOpacity key={a.label} style={[styles.actionBtn,{backgroundColor:colors.card,borderColor:colors.border}]}
              onPress={()=>{ if(Platform.OS!=="web")Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(a.route as any); }}
              activeOpacity={0.75}
            >
              <LinearGradient colors={[a.color+"30",a.color+"10"]} style={styles.actionIcon}>
                <Feather name={a.icon} size={18} color={a.color}/>
              </LinearGradient>
              <Text style={[styles.actionLabel,{color:colors.foreground}]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Promo banners */}
        <View style={styles.bannerWrap}>
          <ScrollView
            ref={bannerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e)=>setBannerIdx(Math.round(e.nativeEvent.contentOffset.x/(SCREEN_W-32)))}
            style={styles.bannerScroll}
          >
            {BANNERS.map((b,i)=>(
              <LinearGradient key={b.id} colors={[b.color1,b.color2]} start={{x:0,y:0}} end={{x:1,y:1}}
                style={[styles.bannerCard,{borderColor:b.accent+"40"}]}
              >
                <View style={[styles.bannerIconWrap,{backgroundColor:b.accent+"22"}]}>
                  <Feather name={b.icon} size={24} color={b.accent}/>
                </View>
                <View style={{flex:1}}>
                  <Text style={[styles.bannerTitle,{color:"#f8fafc"}]}>{b.title}</Text>
                  <Text style={[styles.bannerSub,{color:"#6b7a9e"}]}>{b.sub}</Text>
                </View>
              </LinearGradient>
            ))}
          </ScrollView>
          <View style={styles.bannerDots}>
            {BANNERS.map((_,i)=>(
              <View key={i} style={[styles.bannerDot,{backgroundColor:i===bannerIdx?colors.primary:colors.muted}]}/>
            ))}
          </View>
        </View>

        {/* Trending */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle,{color:colors.foreground}]}>⚡ Trending</Text>
          <TouchableOpacity onPress={()=>router.push("/(tabs)/markets")}>
            <Text style={[styles.seeAll,{color:colors.primary}]}>All Markets →</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:16,gap:10}}>
          {trending.map((t)=>{
            const bg = COIN_COLORS[t.symbol]??"#6b7a9e";
            const spark = genSparkData(t.usdt,t.change24h,t.symbol,15);
            return (
              <TouchableOpacity key={t.symbol} style={[styles.trendCard,{backgroundColor:colors.card,borderColor:colors.border}]} onPress={()=>router.push(`/trade/${t.symbol}USDT` as any)}>
                <View style={styles.trendTop}>
                  <View style={[styles.trendIcon,{backgroundColor:bg+"22"}]}>
                    <Text style={[styles.trendIconText,{color:bg}]}>{t.symbol.charAt(0)}</Text>
                  </View>
                  <View>
                    <Text style={[styles.trendSym,{color:colors.foreground}]}>{t.symbol}</Text>
                    <Text style={[styles.trendChange,{color:t.change24h>=0?"#0ECB81":"#F6465D"}]}>
                      {t.change24h>=0?"+":""}{t.change24h.toFixed(2)}%
                    </Text>
                  </View>
                </View>
                <SparkLine data={spark} width={80} height={30} positive={t.change24h>=0} id={`tr${t.symbol}`}/>
                <Text style={[styles.trendPrice,{color:colors.foreground}]}>
                  ${t.usdt<0.01?t.usdt.toFixed(6):t.usdt<100?t.usdt.toFixed(4):t.usdt.toLocaleString("en-US",{maximumFractionDigits:0})}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Market table */}
        <View style={[styles.sectionHeader,{marginTop:20}]}>
          <Text style={[styles.sectionTitle,{color:colors.foreground}]}>Markets</Text>
          <View style={styles.marketTabs}>
            {(["hot","gainers","losers"] as MarketTab[]).map((tab)=>(
              <TouchableOpacity key={tab} style={[styles.mTab,marketTab===tab&&{backgroundColor:colors.primary+"22"}]} onPress={()=>setMarketTab(tab)}>
                <Text style={[styles.mTabLabel,{color:marketTab===tab?colors.primary:colors.mutedForeground}]}>
                  {tab==="hot"?"🔥 Hot":tab==="gainers"?"🚀 Gain":"📉 Loss"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[styles.listCard,{backgroundColor:colors.card,borderColor:colors.border}]}>
          {filtered.map((t,i)=>(
            <CoinRowWithSpark
              key={t.symbol}
              symbol={t.symbol}
              price={t.usdt}
              change24h={t.change24h}
              volume={t.volume24h*t.usdt}
              sparkData={genSparkData(t.usdt,t.change24h,t.symbol)}
              rank={i+1}
              onPress={()=>router.push(`/trade/${t.symbol}USDT` as any)}
            />
          ))}
          {filtered.length===0&&(
            <View style={styles.loadingRow}>
              <Text style={{color:colors.mutedForeground,fontSize:12}}>Connecting to live markets...</Text>
            </View>
          )}
          <TouchableOpacity style={[styles.viewAll,{borderTopColor:colors.border}]} onPress={()=>router.push("/(tabs)/markets")}>
            <Text style={[styles.viewAllLabel,{color:colors.primary}]}>View All Markets</Text>
            <Feather name="arrow-right" size={14} color={colors.primary}/>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:{flex:1},
  header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:16,paddingVertical:12},
  greeting:{fontSize:12,fontWeight:"500"},
  brand:{fontSize:26,fontWeight:"900",letterSpacing:-0.5},
  headerRight:{flexDirection:"row",gap:8},
  iconBtn:{width:36,height:36,borderRadius:18,alignItems:"center",justifyContent:"center"},
  tickerScroll:{marginBottom:12},
  tickerContent:{paddingHorizontal:16,gap:8},
  tickerChip:{flexDirection:"row",alignItems:"center",paddingHorizontal:10,paddingVertical:6,borderRadius:20,borderWidth:1,gap:5},
  tickerDot:{width:6,height:6,borderRadius:3},
  tickerSym:{fontSize:11,fontWeight:"600"},
  tickerVal:{fontSize:13,fontWeight:"700"},
  tickerChange:{fontSize:11,fontWeight:"700"},
  cardWrap:{paddingHorizontal:16,marginBottom:12},
  portfolioCard:{borderRadius:18,padding:18,borderWidth:1},
  portTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start"},
  portLabel:{color:"#6b7a9e",fontSize:12},
  portValue:{color:"#f8fafc",fontSize:28,fontWeight:"900",marginTop:2},
  portSub:{color:"#6b7a9e",fontSize:12,marginTop:2},
  portActions:{gap:8},
  portBtn:{flexDirection:"row",alignItems:"center",paddingHorizontal:14,paddingVertical:8,borderRadius:16,gap:4},
  portBtnLabel:{color:"#fff",fontWeight:"700",fontSize:12},
  loginRow:{flexDirection:"row",alignItems:"center",marginTop:14,gap:5},
  loginHint:{color:"#6b7a9e",fontSize:12,flex:1},
  actionsGrid:{flexDirection:"row",flexWrap:"wrap",paddingHorizontal:12,marginBottom:16,gap:8},
  actionBtn:{width:"22%",flexGrow:1,alignItems:"center",paddingVertical:12,borderRadius:12,borderWidth:1,gap:5},
  actionIcon:{width:40,height:40,borderRadius:20,alignItems:"center",justifyContent:"center"},
  actionLabel:{fontSize:11,fontWeight:"600"},
  bannerWrap:{paddingHorizontal:16,marginBottom:20},
  bannerScroll:{},
  bannerCard:{width:SCREEN_W-32,borderRadius:14,borderWidth:1,padding:14,flexDirection:"row",alignItems:"center",gap:12},
  bannerIconWrap:{width:48,height:48,borderRadius:24,alignItems:"center",justifyContent:"center",flexShrink:0},
  bannerTitle:{fontSize:13,fontWeight:"800",marginBottom:2},
  bannerSub:{fontSize:11,lineHeight:15},
  bannerDots:{flexDirection:"row",justifyContent:"center",gap:5,marginTop:10},
  bannerDot:{width:6,height:6,borderRadius:3},
  sectionHeader:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",paddingHorizontal:16,marginBottom:10},
  sectionTitle:{fontSize:16,fontWeight:"800"},
  seeAll:{fontSize:13,fontWeight:"600"},
  trendCard:{width:110,borderRadius:12,borderWidth:1,padding:10,gap:6},
  trendTop:{flexDirection:"row",alignItems:"center",gap:6},
  trendIcon:{width:30,height:30,borderRadius:15,alignItems:"center",justifyContent:"center"},
  trendIconText:{fontSize:13,fontWeight:"700"},
  trendSym:{fontSize:11,fontWeight:"700"},
  trendChange:{fontSize:10,fontWeight:"700"},
  trendPrice:{fontSize:11,fontWeight:"700",fontVariant:["tabular-nums"]},
  marketTabs:{flexDirection:"row",gap:4},
  mTab:{paddingHorizontal:8,paddingVertical:4,borderRadius:8},
  mTabLabel:{fontSize:11,fontWeight:"700"},
  listCard:{marginHorizontal:16,borderRadius:14,borderWidth:1,overflow:"hidden"},
  loadingRow:{padding:24,alignItems:"center"},
  viewAll:{flexDirection:"row",alignItems:"center",justifyContent:"center",paddingVertical:12,borderTopWidth:StyleSheet.hairlineWidth,gap:6},
  viewAllLabel:{fontSize:13,fontWeight:"700"},
});
