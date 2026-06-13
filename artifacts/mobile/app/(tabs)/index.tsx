import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
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
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { usePrices } from "@/hooks/usePrices";
import { apiFetch } from "@/hooks/useApi";
import { SparkLine } from "@/components/SparkLine";

const { width: SW } = Dimensions.get("window");
const GREEN  = "#0ECB81";
const RED    = "#F6465D";
const YELLOW = "#F0B90B";
const BLUE   = "#1890FF";
const PURPLE = "#9945ff";

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface WalletItem   { symbol: string; balance: string; locked: string }
interface WalletResponse { wallets: WalletItem[] }

/* ─── Constants ──────────────────────────────────────────────────────────── */
const COIN_COLORS: Record<string, string> = {
  BTC:"#f7931a", ETH:"#627eea", BNB:"#f3ba2f", XRP:"#346aa9",
  SOL:"#9945ff", ADA:"#3cc8c8", USDT:"#26a17b", MATIC:"#8247e5",
  AVAX:"#e84142", DOT:"#e6007a", LINK:"#2a5ada", DOGE:"#c2a633", DEFAULT:"#6b7a9e",
};

const QUICK_ACTIONS = [
  { label: "Deposit",  icon: "arrow-down-circle" as const, color: GREEN,  route: "/(tabs)/assets" },
  { label: "Withdraw", icon: "arrow-up-circle"   as const, color: RED,    route: "/(tabs)/assets" },
  { label: "Buy",      icon: "shopping-cart"     as const, color: YELLOW, route: "/convert"       },
  { label: "P2P",      icon: "users"             as const, color: PURPLE, route: "/p2p"           },
  { label: "Convert",  icon: "repeat"            as const, color: BLUE,   route: "/convert"       },
  { label: "Earn",     icon: "percent"           as const, color: GREEN,  route: "/earn"          },
  { label: "History",  icon: "clock"             as const, color: "#848E9C", route: "/orders"     },
  { label: "More",     icon: "grid"              as const, color: "#848E9C", route: "/discover"   },
];

const SERVICES = [
  { label: "AI Trading",  icon: "cpu"        as const, color: PURPLE,    route: "/ai-trading",   badge: "NEW" },
  { label: "Bots",        icon: "grid"       as const, color: "#eb9100", route: "/bots",         badge: ""    },
  { label: "Earn",        icon: "percent"    as const, color: GREEN,     route: "/earn",         badge: "28%" },
  { label: "Copy Trade",  icon: "copy"       as const, color: BLUE,      route: "/copy-trading", badge: ""    },
  { label: "Options",     icon: "activity"   as const, color: RED,       route: "/options",      badge: ""    },
  { label: "Convert",     icon: "repeat"     as const, color: GREEN,     route: "/convert",      badge: ""    },
  { label: "INR Pay",     icon: "credit-card"as const, color: YELLOW,    route: "/inr-payments", badge: ""    },
  { label: "Referrals",   icon: "gift"       as const, color: "#eb9100", route: "/invite",       badge: "30%" },
  { label: "P2P",         icon: "users"      as const, color: PURPLE,    route: "/p2p",          badge: ""    },
  { label: "Ledger",      icon: "book"       as const, color: "#848E9C", route: "/ledger",       badge: ""    },
  { label: "Portfolio",   icon: "pie-chart"  as const, color: BLUE,      route: "/portfolio",    badge: ""    },
  { label: "Alerts",      icon: "bell"       as const, color: YELLOW,    route: "/price-alerts", badge: ""    },
];

const PROMO = [
  { id:"1", title:"Invite & Earn 30%",      sub:"Lifetime commission on every referral trade",  color:GREEN,  icon:"gift"       as const, route:"/invite"       },
  { id:"2", title:"AI Trading — Up to 28%", sub:"Let AI manage your portfolio automatically",   color:PURPLE, icon:"cpu"        as const, route:"/ai-trading"   },
  { id:"3", title:"Zero-Fee P2P",           sub:"Buy & sell INR directly with verified traders", color:BLUE,   icon:"users"      as const, route:"/p2p"          },
  { id:"4", title:"Earn 28% APY",           sub:"Stake your idle crypto and earn daily rewards", color:YELLOW, icon:"percent"    as const, route:"/earn"         },
  { id:"5", title:"100× Futures",           sub:"Pro perpetual contracts with deep liquidity",   color:RED,    icon:"trending-up"as const, route:"/futures"      },
];

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function genSpark(price:number, change24h:number, sym:string, n=20):number[] {
  let s = sym.split("").reduce((a,c)=>a+c.charCodeAt(0),0);
  const rng=()=>{s=(s*9301+49297)%233280;return s/233280;};
  const start=price/(1+change24h/100); const pts:number[]=[];
  for(let i=0;i<n;i++){const t=i/(n-1);pts.push(Math.max(start+start*(change24h/100)*t+(rng()-0.5)*start*0.012,1e-8));}
  pts[n-1]=price; return pts;
}

function fmtUsd(v:number){
  return v>=1e6?`$${(v/1e6).toFixed(2)}M`:v>=1e3?`$${(v/1e3).toFixed(1)}K`:`$${v.toFixed(2)}`;
}

/* ─── Portfolio mini-chart (SVG path from simulated history) ──────────────── */
function PortfolioChart({ totalUsdt, change24h }:{ totalUsdt:number; change24h:number }) {
  const W = SW - 64, H = 56;
  const pts = useMemo(()=>{
    const n=30; const arr:number[]=[];
    let s=12345;
    const rng=()=>{s=(s*9301+49297)%233280;return s/233280;};
    const base=totalUsdt||(change24h<0?1010:990);
    for(let i=0;i<n;i++){
      const t=i/(n-1);
      arr.push(base*(1-change24h/100)+base*(change24h/100)*t+(rng()-0.5)*base*0.015);
    }
    arr[n-1]=totalUsdt||arr[n-1]; return arr;
  },[totalUsdt,change24h]);
  const minV=Math.min(...pts), maxV=Math.max(...pts), rng=maxV-minV||1;
  const coords=pts.map((v,i)=>({
    x:(i/(pts.length-1))*W,
    y:H-((v-minV)/rng)*(H-8)-4,
  }));
  const d="M "+coords.map(c=>`${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" L ");
  const area=d+` L ${W},${H} L 0,${H} Z`;
  const isPos=change24h>=0;
  const lineColor=isPos?GREEN:RED;
  return (
    <Svg width={W} height={H}>
      <Defs>
        <SvgGradient id="cg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={lineColor} stopOpacity={0.3}/>
          <Stop offset="100%" stopColor={lineColor} stopOpacity={0}/>
        </SvgGradient>
      </Defs>
      <Path d={area} fill="url(#cg)"/>
      <Path d={d} stroke={lineColor} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

/* ─── Scrolling ticker ────────────────────────────────────────────────────── */
function Ticker({ ticks }:{ ticks:any[] }) {
  const scrollX=useRef(new Animated.Value(0)).current;
  const anim=useRef<Animated.CompositeAnimation|null>(null);
  const items=useMemo(()=>ticks.filter(t=>t.usdt>0).slice(0,18),[ticks]);
  const str=items.map(t=>{
    const p=t.usdt<1?t.usdt.toFixed(4):t.usdt<100?t.usdt.toFixed(2):Math.round(t.usdt).toLocaleString();
    const sign=t.change24h>=0?"+":"";
    return `${t.symbol}  $${p}  ${sign}${t.change24h.toFixed(2)}%`;
  }).join("     ·     ");
  useEffect(()=>{
    if(!str) return;
    const W=str.length*7.8;
    scrollX.setValue(0);
    anim.current=Animated.loop(Animated.timing(scrollX,{toValue:-W,duration:W*55,useNativeDriver:true}));
    anim.current.start();
    return()=>anim.current?.stop();
  },[str]);
  if(!items.length) return null;
  return (
    <View style={{height:26,overflow:"hidden",justifyContent:"center"}}>
      <Animated.Text style={{fontSize:11,color:"#5d6b7a",fontWeight:"500",letterSpacing:0.15,transform:[{translateX:scrollX}]}} numberOfLines={1}>
        {str}{"     ·     "}{str}
      </Animated.Text>
    </View>
  );
}

/* ─── Main screen ─────────────────────────────────────────────────────────── */
export default function HomeScreen() {
  const colors   = useColors();
  const insets   = useSafeAreaInsets();
  const router   = useRouter();
  const { user, isAuthenticated } = useAuth();
  const { ticks, priceMap, inrRate } = usePrices();

  const [hideBalance, setHideBalance] = useState(false);
  const [marketTab, setMarketTab]     = useState<"hot"|"gainers"|"losers">("hot");
  const [promoIdx,  setPromoIdx]      = useState(0);
  const promoRef = useRef<ScrollView>(null);

  const topPt = insets.top + (Platform.OS==="web"?67:0);
  const botPt = insets.bottom + (Platform.OS==="web"?34:0);

  /* wallet query */
  const { data:walletData, isLoading, refetch } = useQuery({
    queryKey:["wallet"],
    queryFn:()=>apiFetch<WalletResponse>("/api/finance/wallet"),
    enabled:isAuthenticated, staleTime:30_000,
  });

  /* portfolio maths */
  const { totalUsdt, totalInr, btcEquiv, change24h } = useMemo(()=>{
    const ws=walletData?.wallets??[];
    const usd=ws.reduce((s,w)=>{
      const b=parseFloat(w.balance)||0;
      const t=priceMap[w.symbol.toUpperCase()];
      if(w.symbol.toUpperCase()==="USDT") return s+b;
      if(w.symbol.toUpperCase()==="INR")  return s+b/inrRate;
      return s+b*(t?.usdt??0);
    },0);
    const btcPx=priceMap["BTC"]?.usdt??1;
    const chg=ws.reduce((s,w)=>{
      const b=parseFloat(w.balance)||0;
      const t=priceMap[w.symbol.toUpperCase()];
      const val=b*(t?.usdt??0);
      return s+val*(t?.change24h??0)/100;
    },0);
    return { totalUsdt:usd, totalInr:usd*inrRate, btcEquiv:usd/btcPx, change24h:usd>0?(chg/usd)*100:0 };
  },[walletData,priceMap,inrRate]);

  /* market list */
  const marketList = useMemo(()=>{
    const base=ticks.filter(t=>t.usdt>0&&t.symbol!=="USDT"&&t.symbol!=="INR");
    if(marketTab==="gainers") return [...base].filter(t=>t.change24h>0).sort((a,b)=>b.change24h-a.change24h).slice(0,8);
    if(marketTab==="losers")  return [...base].filter(t=>t.change24h<0).sort((a,b)=>a.change24h-b.change24h).slice(0,8);
    return [...base].sort((a,b)=>(b.usdt*(b.volume24h??0))-(a.usdt*(a.volume24h??0))).slice(0,8);
  },[ticks,marketTab]);

  /* top movers for hot strip */
  const topMovers = useMemo(()=>
    ticks.filter(t=>t.usdt>0&&t.symbol!=="USDT").sort((a,b)=>Math.abs(b.change24h)-Math.abs(a.change24h)).slice(0,6),
  [ticks]);

  const onRefresh = useCallback(()=>{ void refetch(); },[refetch]);
  const go=(route:string)=>{
    if(Platform.OS!=="web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if(!isAuthenticated&&route!=="/convert"&&route!=="/p2p") { router.push("/login"); return; }
    router.push(route as any);
  };

  const balStr = hideBalance?"$  ••••••"
    : isAuthenticated
      ? `$${totalUsdt.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`
      : "$0.00";
  const isPos = change24h>=0;
  const firstName = user?.name?.split(" ")[0]??"there";

  return (
    <View style={[st.root,{backgroundColor:"#080B0F"}]}>

      {/* ══════════════════ TOP GRADIENT HERO ══════════════════ */}
      <LinearGradient
        colors={["#0A2318","#091A14","#080B0F"]}
        style={[st.hero,{paddingTop:topPt}]}
      >
        {/* Header row */}
        <View style={st.topBar}>
          <View style={st.topLeft}>
            <View style={st.logoMark}>
              <Text style={st.logoZ}>Z</Text>
            </View>
            <View>
              <Text style={st.greeting}>
                {isAuthenticated?`Hello, ${firstName} 👋`:"Welcome to Zebvix"}
              </Text>
              <Text style={st.subGreeting}>
                {new Date().toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"})}
              </Text>
            </View>
          </View>
          <View style={st.topRight}>
            <TouchableOpacity style={st.iconCircle} onPress={()=>router.push("/notifications" as any)}>
              <Feather name="bell" size={18} color="#EAECEF"/>
              <View style={st.notifDot}/>
            </TouchableOpacity>
            <TouchableOpacity style={st.iconCircle} onPress={()=>router.push("/settings" as any)}>
              {isAuthenticated
                ? <View style={[st.avatarSmall,{backgroundColor:GREEN+"33"}]}>
                    <Text style={[st.avatarLetter,{color:GREEN}]}>{user?.name?.charAt(0).toUpperCase()??"Z"}</Text>
                  </View>
                : <Feather name="user" size={18} color="#EAECEF"/>}
            </TouchableOpacity>
          </View>
        </View>

        {/* Live ticker */}
        <Ticker ticks={ticks}/>

        {/* ── Portfolio balance card ── */}
        <View style={st.balanceCard}>
          <View style={st.balanceTop}>
            <View style={{flex:1}}>
              <Text style={st.balLabel}>Total Portfolio Value</Text>
              <View style={st.balRow}>
                <Text style={st.balValue} numberOfLines={1} adjustsFontSizeToFit>{balStr}</Text>
                <TouchableOpacity onPress={()=>setHideBalance(h=>!h)} style={st.eyeBtn}>
                  <Feather name={hideBalance?"eye-off":"eye"} size={16} color="#5D6B7A"/>
                </TouchableOpacity>
              </View>
              {isAuthenticated&&!hideBalance&&(
                <Text style={st.balSub}>≈ ₹{totalInr.toLocaleString("en-IN",{maximumFractionDigits:0})}  ·  {btcEquiv.toFixed(6)} BTC</Text>
              )}
            </View>
            {/* 24h change bubble */}
            <View style={[st.changeBubble,{backgroundColor:(isPos?GREEN:RED)+"20",borderColor:(isPos?GREEN:RED)+"40"}]}>
              <Feather name={isPos?"trending-up":"trending-down"} size={13} color={isPos?GREEN:RED}/>
              <Text style={[st.changeText,{color:isPos?GREEN:RED}]}>
                {isPos?"+":""}{change24h.toFixed(2)}%
              </Text>
              <Text style={st.changeLabel}>24h</Text>
            </View>
          </View>

          {/* Mini portfolio chart */}
          {isAuthenticated&&(
            <View style={st.chartWrap}>
              <PortfolioChart totalUsdt={totalUsdt} change24h={change24h}/>
            </View>
          )}

          {/* Quick action row */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginTop:20}} contentContainerStyle={{gap:12,paddingHorizontal:2}}>
            {QUICK_ACTIONS.map(q=>(
              <TouchableOpacity key={q.label} style={st.qaBtn} onPress={()=>go(q.route)} activeOpacity={0.75}>
                <View style={[st.qaIcon,{backgroundColor:q.color+"20"}]}>
                  <Feather name={q.icon} size={19} color={q.color}/>
                </View>
                <Text style={st.qaLabel}>{q.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </LinearGradient>

      {/* ══════════════════ SCROLL BODY ══════════════════ */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{paddingBottom:botPt+110}}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={GREEN}/>}
      >

        {/* ── Top movers strip ── */}
        {topMovers.length>0&&(
          <View style={st.sec}>
            <View style={st.secRow}>
              <Text style={st.secTitle}>Top Movers</Text>
              <TouchableOpacity onPress={()=>router.push("/(tabs)/markets" as any)}>
                <Text style={[st.secLink,{color:GREEN}]}>See All →</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:10,paddingTop:2}}>
              {topMovers.map(t=>{
                const c=COIN_COLORS[t.symbol]??COIN_COLORS.DEFAULT;
                const isP=t.change24h>=0;
                const p=t.usdt<1?t.usdt.toFixed(4):t.usdt<1000?t.usdt.toFixed(2):t.usdt.toLocaleString("en-US",{maximumFractionDigits:0});
                const spark=genSpark(t.usdt,t.change24h,t.symbol);
                return (
                  <TouchableOpacity key={t.symbol} style={[st.moverCard,{borderColor:(isP?GREEN:RED)+"30"}]} onPress={()=>router.push(`/trade/${t.symbol}USDT` as any)} activeOpacity={0.8}>
                    <LinearGradient colors={[c+"18","transparent"]} start={{x:0,y:0}} end={{x:0,y:1}} style={StyleSheet.absoluteFill}/>
                    <View style={st.moverTop}>
                      <View style={[st.moverCircle,{backgroundColor:c+"25"}]}>
                        <Text style={[st.moverLetter,{color:c}]}>{t.symbol.charAt(0)}</Text>
                      </View>
                      <View style={[st.moverChg,{backgroundColor:(isP?GREEN:RED)+"20"}]}>
                        <Text style={[st.moverChgText,{color:isP?GREEN:RED}]}>{isP?"+":""}{t.change24h.toFixed(1)}%</Text>
                      </View>
                    </View>
                    <Text style={st.moverSym}>{t.symbol}</Text>
                    <Text style={st.moverPrice}>${p}</Text>
                    <SparkLine data={spark} width={108} height={38} positive={isP} id={`mv${t.symbol}`}/>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Promo banners ── */}
        <View style={st.sec}>
          <ScrollView
            ref={promoRef}
            horizontal pagingEnabled showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={e=>setPromoIdx(Math.round(e.nativeEvent.contentOffset.x/(SW-32)))}
          >
            {PROMO.map(b=>(
              <TouchableOpacity key={b.id} style={[st.promoBanner,{width:SW-32}]} activeOpacity={0.88} onPress={()=>go(b.route)}>
                <LinearGradient colors={[b.color+"35","#0E1317"]} start={{x:0,y:0}} end={{x:1,y:0}} style={[StyleSheet.absoluteFill,{borderRadius:18}]}/>
                <View style={[st.promoIconBox,{backgroundColor:b.color+"22"}]}>
                  <Feather name={b.icon} size={24} color={b.color}/>
                </View>
                <View style={{flex:1}}>
                  <Text style={st.promoTitle}>{b.title}</Text>
                  <Text style={st.promoSub}>{b.sub}</Text>
                </View>
                <View style={[st.promoArrow,{backgroundColor:b.color+"22"}]}>
                  <Feather name="arrow-right" size={14} color={b.color}/>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {/* dots */}
          <View style={st.dotRow}>
            {PROMO.map((_,i)=>(
              <View key={i} style={[st.dot,{backgroundColor:i===promoIdx?GREEN:"#2B3139",width:i===promoIdx?22:6}]}/>
            ))}
          </View>
        </View>

        {/* ── Services grid ── */}
        <View style={st.sec}>
          <View style={st.secRow}>
            <Text style={st.secTitle}>Products</Text>
            <View style={[st.badge12,{backgroundColor:GREEN+"18",borderColor:GREEN+"30"}]}>
              <Text style={[st.badge12Text,{color:GREEN}]}>12 Available</Text>
            </View>
          </View>
          <View style={[st.servCard,{backgroundColor:"#0E1317",borderColor:"#1E2730"}]}>
            {/* row 1 */}
            <View style={st.servRow}>
              {SERVICES.slice(0,4).map(s=><SvcTile key={s.label} s={s} go={go}/>)}
            </View>
            <View style={[st.servDivider,{backgroundColor:"#1E2730"}]}/>
            {/* row 2 */}
            <View style={st.servRow}>
              {SERVICES.slice(4,8).map(s=><SvcTile key={s.label} s={s} go={go}/>)}
            </View>
            <View style={[st.servDivider,{backgroundColor:"#1E2730"}]}/>
            {/* row 3 */}
            <View style={st.servRow}>
              {SERVICES.slice(8,12).map(s=><SvcTile key={s.label} s={s} go={go}/>)}
            </View>
          </View>
        </View>

        {/* ── Market overview ── */}
        <View style={st.sec}>
          <View style={st.secRow}>
            <Text style={st.secTitle}>Market Overview</Text>
            <TouchableOpacity onPress={()=>router.push("/(tabs)/markets" as any)}>
              <Text style={[st.secLink,{color:GREEN}]}>See All →</Text>
            </TouchableOpacity>
          </View>

          {/* Tab pills */}
          <View style={st.mTabRow}>
            {(["hot","gainers","losers"] as const).map(t=>(
              <TouchableOpacity
                key={t}
                style={[st.mTabBtn,marketTab===t&&{backgroundColor:GREEN+"18",borderColor:GREEN+"50"}]}
                onPress={()=>setMarketTab(t)}
              >
                <Text style={[st.mTabText,{color:marketTab===t?GREEN:"#5D6B7A"}]}>
                  {t==="hot"?"🔥 Hot":t==="gainers"?"📈 Gainers":"📉 Losers"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Coin list */}
          <View style={[st.coinListCard,{backgroundColor:"#0E1317",borderColor:"#1E2730"}]}>
            <View style={[st.coinListHdr,{borderBottomColor:"#1E2730"}]}>
              <Text style={[st.colLbl,{flex:1,color:"#3D4D5C"}]}>Coin</Text>
              <Text style={[st.colLbl,{width:58,textAlign:"center",color:"#3D4D5C"}]}>7D</Text>
              <Text style={[st.colLbl,{width:78,textAlign:"right",color:"#3D4D5C"}]}>Price</Text>
              <Text style={[st.colLbl,{width:68,textAlign:"right",color:"#3D4D5C"}]}>24h%</Text>
            </View>
            {marketList.length===0&&(
              <View style={{padding:28,alignItems:"center"}}>
                <Text style={{color:"#3D4D5C",fontSize:13}}>Connecting to live markets…</Text>
              </View>
            )}
            {marketList.map((t,i)=>{
              const c=COIN_COLORS[t.symbol]??COIN_COLORS.DEFAULT;
              const isP=t.change24h>=0;
              const spark=genSpark(t.usdt,t.change24h,t.symbol);
              const p=t.usdt<0.01?t.usdt.toFixed(6):t.usdt<100?t.usdt.toFixed(4):t.usdt.toLocaleString("en-US",{maximumFractionDigits:0});
              return (
                <TouchableOpacity
                  key={t.symbol}
                  style={[st.coinRow,{borderBottomColor:"#1E2730",borderBottomWidth:i<marketList.length-1?StyleSheet.hairlineWidth:0}]}
                  onPress={()=>router.push(`/trade/${t.symbol}USDT` as any)}
                  activeOpacity={0.75}
                >
                  <View style={st.coinLeft}>
                    <View style={[st.coinCircle,{backgroundColor:c+"20"}]}>
                      <Text style={[st.coinLetter,{color:c}]}>{t.symbol.charAt(0)}</Text>
                    </View>
                    <View>
                      <Text style={st.coinSym}>{t.symbol}</Text>
                      <Text style={st.coinQuote}>/USDT</Text>
                    </View>
                  </View>
                  <SparkLine data={spark} width={58} height={28} positive={isP} id={`ho${t.symbol}`}/>
                  <Text style={[st.coinPrice,{color:"#EAECEF",width:78}]}>${p}</Text>
                  <View style={[st.chgPill,{backgroundColor:(isP?GREEN:RED)+"20",width:68}]}>
                    <Text style={[st.chgText,{color:isP?GREEN:RED}]}>{isP?"+":""}{t.change24h.toFixed(2)}%</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Learn / News strip ── */}
        <View style={st.sec}>
          <Text style={st.secTitle}>Did You Know?</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:10,paddingTop:12}}>
            {[
              {icon:"zap" as const, color:YELLOW, title:"Zero-Fee Trading",  body:"Makers pay 0% on all spot pairs. Takers pay just 0.1%."},
              {icon:"shield" as const, color:GREEN, title:"100% Insured",     body:"All INR deposits insured by DICGC up to ₹5 lakh."},
              {icon:"cpu" as const, color:PURPLE, title:"AI Signal Accuracy", body:"Our AI models have 74% directional accuracy on BTC."},
              {icon:"gift" as const, color:RED, title:"Referral Bonus",       body:"Earn 30% of fees from everyone you invite — forever."},
            ].map(n=>(
              <View key={n.title} style={[st.newsCard,{backgroundColor:"#0E1317",borderColor:"#1E2730"}]}>
                <View style={[st.newsIcon,{backgroundColor:n.color+"20"}]}>
                  <Feather name={n.icon} size={18} color={n.color}/>
                </View>
                <Text style={st.newsTitle}>{n.title}</Text>
                <Text style={st.newsBody}>{n.body}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* ── Compliance footer ── */}
        <View style={[st.footer,{borderColor:"#1E2730"}]}>
          <Feather name="shield" size={11} color={GREEN}/>
          <Text style={st.footerText}>FIU-IND Registered · PMLA 2002 Compliant · 256-bit SSL Encrypted</Text>
        </View>
      </ScrollView>
    </View>
  );
}

/* ─── Service tile sub-component ─────────────────────────────────────────── */
function SvcTile({s,go}:{s:typeof SERVICES[0];go:(r:string)=>void}) {
  return (
    <TouchableOpacity style={st.svcTile} onPress={()=>go(s.route)} activeOpacity={0.7}>
      <View style={[st.svcIcon,{backgroundColor:s.color+"20"}]}>
        <Feather name={s.icon} size={22} color={s.color}/>
        {s.badge?(
          <View style={[st.svcBadge,{backgroundColor:s.color}]}>
            <Text style={st.svcBadgeText}>{s.badge}</Text>
          </View>
        ):null}
      </View>
      <Text style={st.svcLabel}>{s.label}</Text>
    </TouchableOpacity>
  );
}

/* ─── Styles ──────────────────────────────────────────────────────────────── */
const st = StyleSheet.create({
  root:{ flex:1, backgroundColor:"#080B0F" },

  /* hero */
  hero:{ paddingHorizontal:0 },
  topBar:{ flexDirection:"row", justifyContent:"space-between", alignItems:"center", paddingHorizontal:20, paddingBottom:10, paddingTop:6 },
  topLeft:{ flexDirection:"row", alignItems:"center", gap:12 },
  logoMark:{ width:34, height:34, borderRadius:10, backgroundColor:GREEN, alignItems:"center", justifyContent:"center" },
  logoZ:{ fontSize:19, fontWeight:"900", color:"#000" },
  greeting:{ fontSize:15, fontWeight:"700", color:"#EAECEF" },
  subGreeting:{ fontSize:11, color:"#5D6B7A", marginTop:1 },
  topRight:{ flexDirection:"row", gap:10 },
  iconCircle:{ width:38, height:38, borderRadius:19, backgroundColor:"#111820", alignItems:"center", justifyContent:"center", position:"relative" },
  notifDot:{ position:"absolute", top:9, right:9, width:7, height:7, borderRadius:4, backgroundColor:RED, borderWidth:1.5, borderColor:"#080B0F" },
  avatarSmall:{ width:24, height:24, borderRadius:12, alignItems:"center", justifyContent:"center" },
  avatarLetter:{ fontSize:12, fontWeight:"800" },

  /* balance card */
  balanceCard:{ marginHorizontal:16, marginTop:6, marginBottom:20, backgroundColor:"#0E1317", borderRadius:22, borderWidth:1, borderColor:"#1A2530", padding:20 },
  balanceTop:{ flexDirection:"row", alignItems:"flex-start", gap:10 },
  balLabel:{ fontSize:11, color:"#5D6B7A", fontWeight:"600", textTransform:"uppercase", letterSpacing:0.6, marginBottom:4 },
  balRow:{ flexDirection:"row", alignItems:"center", gap:8 },
  balValue:{ fontSize:32, fontWeight:"900", color:"#EAECEF", letterSpacing:-1 },
  eyeBtn:{ marginTop:4 },
  balSub:{ fontSize:12, color:"#5D6B7A", marginTop:4 },
  changeBubble:{ flexDirection:"row", alignItems:"center", gap:5, paddingHorizontal:10, paddingVertical:7, borderRadius:20, borderWidth:1 },
  changeText:{ fontSize:13, fontWeight:"700" },
  changeLabel:{ fontSize:10, color:"#5D6B7A" },
  chartWrap:{ marginTop:14, marginHorizontal:2 },

  /* quick actions */
  qaBtn:{ alignItems:"center", gap:7, minWidth:56 },
  qaIcon:{ width:50, height:50, borderRadius:16, alignItems:"center", justifyContent:"center" },
  qaLabel:{ fontSize:10, color:"#5D6B7A", fontWeight:"600" },

  /* sections */
  sec:{ paddingHorizontal:16, marginBottom:22 },
  secRow:{ flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:12 },
  secTitle:{ fontSize:16, fontWeight:"800", color:"#EAECEF" },
  secLink:{ fontSize:13, fontWeight:"600" },
  badge12:{ paddingHorizontal:8, paddingVertical:3, borderRadius:8, borderWidth:1 },
  badge12Text:{ fontSize:10, fontWeight:"700" },

  /* top movers */
  moverCard:{ width:126, borderRadius:15, borderWidth:1, padding:12, gap:4, overflow:"hidden", backgroundColor:"#0E1317" },
  moverTop:{ flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:6 },
  moverCircle:{ width:32, height:32, borderRadius:16, alignItems:"center", justifyContent:"center" },
  moverLetter:{ fontSize:14, fontWeight:"800" },
  moverChg:{ paddingHorizontal:6, paddingVertical:2, borderRadius:6 },
  moverChgText:{ fontSize:9, fontWeight:"700" },
  moverSym:{ fontSize:13, fontWeight:"700", color:"#EAECEF" },
  moverPrice:{ fontSize:11, color:"#848E9C", marginBottom:4 },

  /* promo */
  promoBanner:{ flexDirection:"row", alignItems:"center", gap:14, padding:16, borderRadius:18, overflow:"hidden", borderWidth:1, borderColor:"#1E2730", backgroundColor:"#0E1317" },
  promoIconBox:{ width:50, height:50, borderRadius:14, alignItems:"center", justifyContent:"center", flexShrink:0 },
  promoTitle:{ fontSize:14, fontWeight:"800", color:"#EAECEF", marginBottom:3 },
  promoSub:{ fontSize:11, color:"#5D6B7A", lineHeight:16 },
  promoArrow:{ width:30, height:30, borderRadius:15, alignItems:"center", justifyContent:"center", flexShrink:0 },
  dotRow:{ flexDirection:"row", justifyContent:"center", gap:5, marginTop:10, alignItems:"center" },
  dot:{ height:5, borderRadius:3 },

  /* services */
  servCard:{ borderRadius:18, borderWidth:1, overflow:"hidden" },
  servRow:{ flexDirection:"row" },
  servDivider:{ height:StyleSheet.hairlineWidth },
  svcTile:{ flex:1, alignItems:"center", paddingVertical:18, gap:7 },
  svcIcon:{ width:54, height:54, borderRadius:16, alignItems:"center", justifyContent:"center" },
  svcBadge:{ position:"absolute", top:-5, right:-5, paddingHorizontal:4, paddingVertical:1.5, borderRadius:6 },
  svcBadgeText:{ fontSize:7, fontWeight:"900", color:"#fff" },
  svcLabel:{ fontSize:10, fontWeight:"600", color:"#848E9C", textAlign:"center" },

  /* market */
  mTabRow:{ flexDirection:"row", gap:8, marginBottom:12 },
  mTabBtn:{ paddingHorizontal:13, paddingVertical:7, borderRadius:20, borderWidth:1, borderColor:"#1E2730" },
  mTabText:{ fontSize:12, fontWeight:"700" },
  coinListCard:{ borderRadius:16, borderWidth:1, overflow:"hidden" },
  coinListHdr:{ flexDirection:"row", alignItems:"center", paddingHorizontal:14, paddingVertical:9, borderBottomWidth:StyleSheet.hairlineWidth },
  colLbl:{ fontSize:10, fontWeight:"600", textTransform:"uppercase", letterSpacing:0.4 },
  coinRow:{ flexDirection:"row", alignItems:"center", paddingHorizontal:14, paddingVertical:12, gap:2 },
  coinLeft:{ flex:1, flexDirection:"row", alignItems:"center", gap:10 },
  coinCircle:{ width:38, height:38, borderRadius:19, alignItems:"center", justifyContent:"center" },
  coinLetter:{ fontSize:15, fontWeight:"800" },
  coinSym:{ fontSize:13, fontWeight:"700", color:"#EAECEF" },
  coinQuote:{ fontSize:10, color:"#5D6B7A", marginTop:1 },
  coinPrice:{ fontSize:13, fontWeight:"600", textAlign:"right" },
  chgPill:{ paddingVertical:5, borderRadius:7, alignItems:"center" },
  chgText:{ fontSize:11, fontWeight:"700" },

  /* news */
  newsCard:{ width:186, borderRadius:14, borderWidth:1, padding:14, gap:8 },
  newsIcon:{ width:40, height:40, borderRadius:12, alignItems:"center", justifyContent:"center" },
  newsTitle:{ fontSize:13, fontWeight:"800", color:"#EAECEF" },
  newsBody:{ fontSize:11, color:"#5D6B7A", lineHeight:17 },

  /* footer */
  footer:{ marginHorizontal:16, marginTop:4, flexDirection:"row", alignItems:"center", justifyContent:"center", gap:6, paddingVertical:10, borderTopWidth:StyleSheet.hairlineWidth },
  footerText:{ fontSize:10, color:"#3D4D5C" },
});
