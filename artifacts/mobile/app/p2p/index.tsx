import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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
import { apiFetch, apiPost } from "@/hooks/useApi";
import { EmptyState } from "@/components/EmptyState";

const GREEN = "#0ECB81";
const RED = "#F6465D";
const YELLOW = "#F0B90B";

interface P2pOffer {
  id: number;
  uid: string;
  side: "buy" | "sell";
  fiat: string;
  price: number;
  availableQty: number;
  minFiat: number;
  maxFiat: number;
  paymentMethods: string[];
  status: string;
  merchant: { id: number; name: string; handle: string; kycLevel: number; tradeCount?: number; completionRate?: number };
  coin?: { symbol: string; name: string } | null;
}

interface P2pTrade {
  id: number;
  status: string;
  side: "buy" | "sell";
  cryptoAmount: string;
  fiatAmount: string;
  price: string;
  offer: { coin: { symbol: string }; merchant: { name: string } };
  createdAt: string;
}

type MainTab = "buy" | "sell" | "myoffers" | "mytrades";
const COINS = ["USDT", "BTC", "ETH", "BNB", "SOL"];
const PAYMENT_METHODS = ["All", "UPI", "IMPS", "NEFT", "PhonePe", "GPay", "Paytm", "Bank"];
const METHOD_ICONS: Record<string, string> = {
  upi: "UPI", imps: "IMPS", neft: "NEFT", bank: "Bank",
  paytm: "Paytm", phonepe: "PhonePe", gpay: "GPay",
};

const TRADE_STATUS_COLOR: Record<string, string> = {
  pending: YELLOW, paid: "#627eea", released: GREEN, cancelled: RED,
  disputed: RED, completed: GREEN,
};

export default function P2PScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();

  const [mainTab, setMainTab] = useState<MainTab>("buy");
  const [selectedCoin, setSelectedCoin] = useState("USDT");
  const [selectedMethod, setSelectedMethod] = useState("All");
  const [amountFilter, setAmountFilter] = useState("");
  const [showPostModal, setShowPostModal] = useState(false);

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const apiSide = mainTab === "buy" ? "sell" : "buy";
  const { data: offers, isLoading: offersLoading } = useQuery({
    queryKey: ["p2p-offers", mainTab, selectedCoin, selectedMethod, amountFilter],
    queryFn: () => apiFetch<P2pOffer[]>(
      `/api/p2p/offer?side=${apiSide}&coin=${selectedCoin}${amountFilter ? `&amount=${amountFilter}` : ""}${selectedMethod !== "All" ? `&method=${selectedMethod.toLowerCase()}` : ""}`
    ),
    enabled: mainTab === "buy" || mainTab === "sell",
    refetchInterval: 15000,
  });

  const { data: myOffers, isLoading: myOffersLoading } = useQuery({
    queryKey: ["p2p-my-offers"],
    queryFn: () => apiFetch<P2pOffer[]>("/api/p2p/offer?mine=1"),
    enabled: isAuthenticated && mainTab === "myoffers",
  });

  const { data: myTrades, isLoading: myTradesLoading } = useQuery({
    queryKey: ["p2p-my-trades"],
    queryFn: () => apiFetch<P2pTrade[]>("/api/p2p/trade?mine=1"),
    enabled: isAuthenticated && mainTab === "mytrades",
  });

  const filteredOffers = useMemo(() => {
    if (!offers) return [];
    let list = [...offers];
    if (amountFilter) {
      const amt = parseFloat(amountFilter);
      if (!isNaN(amt)) list = list.filter((o) => o.minFiat <= amt && o.maxFiat >= amt);
    }
    return list;
  }, [offers, amountFilter]);

  const handleTrade = (offer: P2pOffer) => {
    if (!isAuthenticated) { router.push("/login"); return; }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const action = mainTab === "buy" ? "buy from" : "sell to";
    Alert.alert(
      `${mainTab === "buy" ? "Buy" : "Sell"} ${offer.coin?.symbol ?? "USDT"}`,
      `You want to ${action} ${offer.merchant.name} at ₹${offer.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}/USDT\n\nLimit: ₹${(offer.minFiat / 1000).toFixed(0)}K – ₹${(offer.maxFiat / 1000).toFixed(0)}K`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Continue", onPress: () => {} },
      ]
    );
  };

  const MAIN_TABS: { key: MainTab; label: string }[] = [
    { key: "buy", label: "Buy" },
    { key: "sell", label: "Sell" },
    { key: "myoffers", label: "My Offers" },
    { key: "mytrades", label: "My Trades" },
  ];

  const tabColor = (tab: MainTab) => {
    if (tab === "buy") return GREEN;
    if (tab === "sell") return RED;
    return colors.primary;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>P2P Trading</Text>
        <TouchableOpacity
          style={[styles.postBtn, { backgroundColor: GREEN + "22", borderColor: GREEN + "44" }]}
          onPress={() => {
            if (!isAuthenticated) { router.push("/login"); return; }
            setShowPostModal(true);
          }}
        >
          <Feather name="plus" size={14} color={GREEN} />
          <Text style={[styles.postBtnText, { color: GREEN }]}>Post</Text>
        </TouchableOpacity>
      </View>

      {/* Main Tabs */}
      <View style={[styles.mainTabRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {MAIN_TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.mainTabBtn, mainTab === t.key && { borderBottomColor: tabColor(t.key), borderBottomWidth: 2 }]}
            onPress={() => setMainTab(t.key)}
          >
            <Text style={[styles.mainTabLabel, { color: mainTab === t.key ? tabColor(t.key) : colors.mutedForeground }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {(mainTab === "buy" || mainTab === "sell") && (
        <>
          {/* Coin selector */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.coinRow, { backgroundColor: colors.card }]}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}
          >
            {COINS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.coinChip, { backgroundColor: selectedCoin === c ? GREEN : colors.muted, borderColor: selectedCoin === c ? GREEN : "transparent" }]}
                onPress={() => setSelectedCoin(c)}
              >
                <Text style={[styles.coinChipText, { color: selectedCoin === c ? "#fff" : colors.mutedForeground }]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Filters */}
          <View style={[styles.filterBar, { backgroundColor: colors.muted, borderBottomColor: colors.border }]}>
            <View style={[styles.amtInput, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="search" size={14} color={colors.mutedForeground} />
              <TextInput
                style={[styles.amtInputText, { color: colors.foreground }]}
                placeholder="Enter INR amount"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
                value={amountFilter}
                onChangeText={setAmountFilter}
              />
              {amountFilter ? (
                <TouchableOpacity onPress={() => setAmountFilter("")}>
                  <Feather name="x" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
              ) : null}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
              {PAYMENT_METHODS.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.methodChip, { backgroundColor: selectedMethod === m ? GREEN + "22" : colors.card, borderColor: selectedMethod === m ? GREEN : colors.border }]}
                  onPress={() => setSelectedMethod(m)}
                >
                  <Text style={[styles.methodChipText, { color: selectedMethod === m ? GREEN : colors.mutedForeground }]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Offer list */}
          {offersLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={GREEN} size="large" />
            </View>
          ) : (
            <FlatList
              data={filteredOffers}
              keyExtractor={(o) => o.id.toString()}
              contentContainerStyle={{ paddingBottom: botPt + 20, flexGrow: 1 }}
              ListHeaderComponent={
                <View style={[styles.colHeader, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.colLabel, { color: colors.mutedForeground, flex: 2 }]}>Merchant</Text>
                  <Text style={[styles.colLabel, { color: colors.mutedForeground, flex: 1.2, textAlign: "right" }]}>Price</Text>
                  <Text style={[styles.colLabel, { color: colors.mutedForeground, flex: 1.2, textAlign: "right" }]}>Available</Text>
                  <View style={{ width: 60 }} />
                </View>
              }
              renderItem={({ item: o }) => (
                <View style={[styles.offerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {/* Merchant info */}
                  <View style={styles.offerTop}>
                    <View style={[styles.merchantAvatar, { backgroundColor: GREEN + "22" }]}>
                      <Text style={[styles.merchantAvatarText, { color: GREEN }]}>{o.merchant.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.merchantRow}>
                        <Text style={[styles.merchantName, { color: colors.foreground }]}>{o.merchant.name}</Text>
                        {o.merchant.kycLevel >= 2 && (
                          <View style={[styles.verifiedBadge, { backgroundColor: GREEN + "22" }]}>
                            <Feather name="check-circle" size={10} color={GREEN} />
                            <Text style={[styles.verifiedText, { color: GREEN }]}>Verified</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.merchantStats, { color: colors.mutedForeground }]}>
                        {o.merchant.tradeCount ?? "100+"} orders · {o.merchant.completionRate ?? "99"}% completion
                      </Text>
                    </View>
                  </View>

                  {/* Price row */}
                  <View style={styles.offerMid}>
                    <View style={styles.offerStat}>
                      <Text style={[styles.offerStatLabel, { color: colors.mutedForeground }]}>Price</Text>
                      <Text style={[styles.offerPrice, { color: mainTab === "buy" ? GREEN : RED }]}>
                        ₹{o.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                    <View style={styles.offerStat}>
                      <Text style={[styles.offerStatLabel, { color: colors.mutedForeground }]}>Available</Text>
                      <Text style={[styles.offerStatValue, { color: colors.foreground }]}>
                        {o.availableQty.toFixed(2)} {o.coin?.symbol ?? selectedCoin}
                      </Text>
                    </View>
                    <View style={styles.offerStat}>
                      <Text style={[styles.offerStatLabel, { color: colors.mutedForeground }]}>Limit</Text>
                      <Text style={[styles.offerStatValue, { color: colors.foreground }]}>
                        ₹{(o.minFiat / 1000).toFixed(0)}K–{(o.maxFiat / 1000).toFixed(0)}K
                      </Text>
                    </View>
                  </View>

                  {/* Payment methods + action */}
                  <View style={styles.offerBottom}>
                    <View style={styles.methodTags}>
                      {o.paymentMethods.slice(0, 3).map((m) => (
                        <View key={m} style={[styles.methodTag, { backgroundColor: colors.muted }]}>
                          <Text style={[styles.methodTagText, { color: colors.mutedForeground }]}>
                            {METHOD_ICONS[m] ?? m}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <TouchableOpacity
                      style={[styles.tradeBtn, { backgroundColor: mainTab === "buy" ? GREEN : RED }]}
                      onPress={() => handleTrade(o)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.tradeBtnText}>{mainTab === "buy" ? "Buy" : "Sell"}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <EmptyState icon="users" title="No offers found" subtitle={`No ${mainTab} offers for ${selectedCoin} right now`} />
              }
            />
          )}
        </>
      )}

      {/* My Offers tab */}
      {mainTab === "myoffers" && (
        <View style={{ flex: 1 }}>
          {!isAuthenticated ? (
            <EmptyState icon="lock" title="Login Required" subtitle="Log in to see your offers" />
          ) : myOffersLoading ? (
            <View style={styles.center}><ActivityIndicator color={GREEN} size="large" /></View>
          ) : (
            <FlatList
              data={myOffers ?? []}
              keyExtractor={(o) => o.id.toString()}
              contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1, paddingBottom: botPt + 20 }}
              renderItem={({ item: o }) => (
                <View style={[styles.myOfferCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.myOfferTop}>
                    <View style={[styles.sideBadge, { backgroundColor: (o.side === "buy" ? GREEN : RED) + "22" }]}>
                      <Text style={[styles.sideBadgeText, { color: o.side === "buy" ? GREEN : RED }]}>
                        {o.side === "buy" ? "BUY" : "SELL"}
                      </Text>
                    </View>
                    <Text style={[styles.myOfferCoin, { color: colors.foreground }]}>{o.coin?.symbol ?? "USDT"}</Text>
                    <View style={{ flex: 1 }} />
                    <View style={[styles.statusBadge, { backgroundColor: o.status === "active" ? GREEN + "22" : colors.muted }]}>
                      <Text style={[styles.statusText, { color: o.status === "active" ? GREEN : colors.mutedForeground }]}>
                        {o.status}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.myOfferStats}>
                    <View style={styles.offerStat}>
                      <Text style={[styles.offerStatLabel, { color: colors.mutedForeground }]}>Price</Text>
                      <Text style={[styles.offerStatValue, { color: colors.foreground }]}>₹{o.price.toLocaleString("en-IN")}</Text>
                    </View>
                    <View style={styles.offerStat}>
                      <Text style={[styles.offerStatLabel, { color: colors.mutedForeground }]}>Available</Text>
                      <Text style={[styles.offerStatValue, { color: colors.foreground }]}>{o.availableQty.toFixed(4)}</Text>
                    </View>
                    <View style={styles.offerStat}>
                      <Text style={[styles.offerStatLabel, { color: colors.mutedForeground }]}>Limit</Text>
                      <Text style={[styles.offerStatValue, { color: colors.foreground }]}>
                        ₹{(o.minFiat / 1000).toFixed(0)}K–{(o.maxFiat / 1000).toFixed(0)}K
                      </Text>
                    </View>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <EmptyState icon="list" title="No Offers" subtitle="Post your first P2P offer" />
              }
            />
          )}
        </View>
      )}

      {/* My Trades tab */}
      {mainTab === "mytrades" && (
        <View style={{ flex: 1 }}>
          {!isAuthenticated ? (
            <EmptyState icon="lock" title="Login Required" subtitle="Log in to see your trades" />
          ) : myTradesLoading ? (
            <View style={styles.center}><ActivityIndicator color={GREEN} size="large" /></View>
          ) : (
            <FlatList
              data={myTrades ?? []}
              keyExtractor={(t) => t.id.toString()}
              contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1, paddingBottom: botPt + 20 }}
              renderItem={({ item: t }) => {
                const statusColor = TRADE_STATUS_COLOR[t.status] ?? colors.mutedForeground;
                return (
                  <View style={[styles.tradeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.tradeCardTop}>
                      <View style={[styles.sideBadge, { backgroundColor: (t.side === "buy" ? GREEN : RED) + "22" }]}>
                        <Text style={[styles.sideBadgeText, { color: t.side === "buy" ? GREEN : RED }]}>
                          {t.side === "buy" ? "BUY" : "SELL"}
                        </Text>
                      </View>
                      <Text style={[styles.tradeCoin, { color: colors.foreground }]}>
                        {t.offer?.coin?.symbol ?? "USDT"} — {t.offer?.merchant?.name ?? "Merchant"}
                      </Text>
                      <View style={{ flex: 1 }} />
                      <View style={[styles.statusBadge, { backgroundColor: statusColor + "22" }]}>
                        <Text style={[styles.statusText, { color: statusColor }]}>{t.status}</Text>
                      </View>
                    </View>
                    <View style={styles.tradeCardMid}>
                      <View style={styles.offerStat}>
                        <Text style={[styles.offerStatLabel, { color: colors.mutedForeground }]}>Crypto</Text>
                        <Text style={[styles.offerStatValue, { color: colors.foreground }]}>{parseFloat(t.cryptoAmount).toFixed(4)}</Text>
                      </View>
                      <View style={styles.offerStat}>
                        <Text style={[styles.offerStatLabel, { color: colors.mutedForeground }]}>INR Amount</Text>
                        <Text style={[styles.offerStatValue, { color: colors.foreground }]}>₹{parseFloat(t.fiatAmount).toLocaleString("en-IN")}</Text>
                      </View>
                      <View style={styles.offerStat}>
                        <Text style={[styles.offerStatLabel, { color: colors.mutedForeground }]}>Price</Text>
                        <Text style={[styles.offerStatValue, { color: colors.foreground }]}>₹{parseFloat(t.price).toLocaleString("en-IN")}</Text>
                      </View>
                    </View>
                    {(t.status === "pending" || t.status === "paid") && (
                      <View style={styles.tradeActions}>
                        {t.status === "pending" && t.side === "buy" && (
                          <TouchableOpacity style={[styles.actionSmall, { backgroundColor: GREEN }]}>
                            <Text style={styles.actionSmallText}>Mark as Paid</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity style={[styles.actionSmall, { backgroundColor: RED + "22", borderColor: RED + "44", borderWidth: 1 }]}>
                          <Text style={[styles.actionSmallText, { color: RED }]}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              }}
              ListEmptyComponent={
                <EmptyState icon="activity" title="No Trades Yet" subtitle="Start trading P2P to see history here" />
              }
            />
          )}
        </View>
      )}

      {/* Post Offer Modal */}
      <PostOfferModal
        visible={showPostModal}
        onClose={() => setShowPostModal(false)}
        colors={colors}
        selectedCoin={selectedCoin}
      />
    </View>
  );
}

function PostOfferModal({ visible, onClose, colors, selectedCoin }: {
  visible: boolean; onClose: () => void; colors: any; selectedCoin: string;
}) {
  const qc = useQueryClient();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [coin, setCoin] = useState(selectedCoin);
  const [price, setPrice] = useState("");
  const [totalQty, setTotalQty] = useState("");
  const [minFiat, setMinFiat] = useState("");
  const [maxFiat, setMaxFiat] = useState("");
  const [methods, setMethods] = useState<string[]>(["upi"]);
  const [step, setStep] = useState(1);

  const mutation = useMutation({
    mutationFn: () => apiPost("/api/p2p/offer", {
      side, coin, price: parseFloat(price), totalQty: parseFloat(totalQty),
      minFiat: parseFloat(minFiat), maxFiat: parseFloat(maxFiat), paymentMethods: methods,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["p2p-my-offers"] });
      onClose();
      Alert.alert("Success", "Your offer has been posted successfully!");
    },
  });

  const toggleMethod = (m: string) => {
    setMethods((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Post Offer</Text>
          <Text style={[styles.modalStep, { color: colors.mutedForeground }]}>Step {step}/2</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
          {step === 1 ? (
            <>
              {/* Buy/Sell */}
              <View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>I want to</Text>
                <View style={styles.segRow}>
                  {(["buy", "sell"] as const).map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.segBtn, { backgroundColor: side === s ? (s === "buy" ? GREEN : RED) : colors.muted }]}
                      onPress={() => setSide(s)}
                    >
                      <Text style={[styles.segBtnText, { color: side === s ? "#fff" : colors.mutedForeground }]}>
                        {s === "buy" ? "Buy Crypto" : "Sell Crypto"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Coin */}
              <View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Crypto</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {COINS.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.coinChip, { backgroundColor: coin === c ? GREEN : colors.muted, borderColor: coin === c ? GREEN : "transparent" }]}
                      onPress={() => setCoin(c)}
                    >
                      <Text style={[styles.coinChipText, { color: coin === c ? "#fff" : colors.mutedForeground }]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Price */}
              <View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Your Price (INR per {coin})</Text>
                <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.inputPrefix, { color: colors.mutedForeground }]}>₹</Text>
                  <TextInput
                    style={[styles.inputField, { color: colors.foreground }]}
                    placeholder="0.00"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                    value={price}
                    onChangeText={setPrice}
                  />
                </View>
              </View>

              {/* Total Qty */}
              <View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Total {coin} to {side}</Text>
                <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.inputField, { color: colors.foreground }]}
                    placeholder="0.00"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                    value={totalQty}
                    onChangeText={setTotalQty}
                  />
                  <Text style={[styles.inputSuffix, { color: colors.mutedForeground }]}>{coin}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.nextBtn, { backgroundColor: GREEN, opacity: price && totalQty ? 1 : 0.5 }]}
                onPress={() => setStep(2)}
                disabled={!price || !totalQty}
              >
                <Text style={styles.nextBtnText}>Next →</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* Min/Max Limit */}
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Min Order (INR)</Text>
                  <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.inputPrefix, { color: colors.mutedForeground }]}>₹</Text>
                    <TextInput
                      style={[styles.inputField, { color: colors.foreground }]}
                      placeholder="500"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="numeric"
                      value={minFiat}
                      onChangeText={setMinFiat}
                    />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Max Order (INR)</Text>
                  <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.inputPrefix, { color: colors.mutedForeground }]}>₹</Text>
                    <TextInput
                      style={[styles.inputField, { color: colors.foreground }]}
                      placeholder="100000"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="numeric"
                      value={maxFiat}
                      onChangeText={setMaxFiat}
                    />
                  </View>
                </View>
              </View>

              {/* Payment Methods */}
              <View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Payment Methods</Text>
                <View style={styles.methodGrid}>
                  {["upi", "imps", "neft", "bank", "paytm", "phonepe", "gpay"].map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.methodCheckBtn, {
                        backgroundColor: methods.includes(m) ? GREEN + "22" : colors.muted,
                        borderColor: methods.includes(m) ? GREEN : colors.border,
                      }]}
                      onPress={() => toggleMethod(m)}
                    >
                      <Feather name={methods.includes(m) ? "check-square" : "square"} size={14} color={methods.includes(m) ? GREEN : colors.mutedForeground} />
                      <Text style={[styles.methodCheckText, { color: methods.includes(m) ? GREEN : colors.mutedForeground }]}>
                        {METHOD_ICONS[m] ?? m}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Summary */}
              <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.summaryTitle, { color: colors.mutedForeground }]}>Summary</Text>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Type</Text>
                  <Text style={[styles.summaryValue, { color: side === "buy" ? GREEN : RED }]}>{side.toUpperCase()} {coin}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Price</Text>
                  <Text style={[styles.summaryValue, { color: colors.foreground }]}>₹{parseFloat(price || "0").toLocaleString("en-IN")}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Total Value</Text>
                  <Text style={[styles.summaryValue, { color: GREEN }]}>₹{(parseFloat(price || "0") * parseFloat(totalQty || "0")).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</Text>
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity style={[styles.backStepBtn, { borderColor: colors.border }]} onPress={() => setStep(1)}>
                  <Text style={[styles.backStepText, { color: colors.foreground }]}>← Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.nextBtn, { flex: 1, backgroundColor: GREEN, opacity: minFiat && maxFiat && methods.length > 0 ? 1 : 0.5 }]}
                  onPress={() => mutation.mutate()}
                  disabled={!minFiat || !maxFiat || methods.length === 0 || mutation.isPending}
                >
                  {mutation.isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.nextBtnText}>Post Offer</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "700" },
  postBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  postBtnText: { fontSize: 13, fontWeight: "700" },
  mainTabRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  mainTabBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  mainTabLabel: { fontSize: 13, fontWeight: "700" },
  coinRow: { borderBottomWidth: StyleSheet.hairlineWidth },
  coinChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  coinChipText: { fontSize: 13, fontWeight: "700" },
  filterBar: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  amtInput: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  amtInputText: { flex: 1, fontSize: 13 },
  methodChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  methodChipText: { fontSize: 11, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  colHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  colLabel: { fontSize: 11, fontWeight: "600", textTransform: "uppercase" },
  offerCard: { margin: 12, marginBottom: 0, borderRadius: 14, borderWidth: 1, padding: 14, gap: 12 },
  offerTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  merchantAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  merchantAvatarText: { fontSize: 16, fontWeight: "800" },
  merchantRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  merchantName: { fontSize: 14, fontWeight: "700" },
  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 },
  verifiedText: { fontSize: 9, fontWeight: "700" },
  merchantStats: { fontSize: 11, marginTop: 2 },
  offerMid: { flexDirection: "row", justifyContent: "space-between" },
  offerStat: { gap: 2 },
  offerStatLabel: { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.3 },
  offerPrice: { fontSize: 18, fontWeight: "800" },
  offerStatValue: { fontSize: 13, fontWeight: "600" },
  offerBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  methodTags: { flexDirection: "row", gap: 4, flexWrap: "wrap" },
  methodTag: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  methodTagText: { fontSize: 10, fontWeight: "600" },
  tradeBtn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 10 },
  tradeBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  myOfferCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  myOfferTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  myOfferCoin: { fontSize: 16, fontWeight: "800" },
  sideBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  sideBadgeText: { fontSize: 11, fontWeight: "800" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: "700" },
  myOfferStats: { flexDirection: "row", justifyContent: "space-between" },
  tradeCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 12 },
  tradeCardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  tradeCoin: { fontSize: 14, fontWeight: "700" },
  tradeCardMid: { flexDirection: "row", justifyContent: "space-between" },
  tradeActions: { flexDirection: "row", gap: 10 },
  actionSmall: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: "center" },
  actionSmallText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  modalRoot: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  modalStep: { fontSize: 13 },
  fieldLabel: { fontSize: 12, fontWeight: "600", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  segRow: { flexDirection: "row", gap: 10 },
  segBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  segBtnText: { fontSize: 14, fontWeight: "700" },
  inputRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  inputPrefix: { fontSize: 16, fontWeight: "700" },
  inputSuffix: { fontSize: 14, fontWeight: "600" },
  inputField: { flex: 1, fontSize: 16 },
  nextBtn: { paddingVertical: 15, borderRadius: 12, alignItems: "center" },
  nextBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  methodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  methodCheckBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  methodCheckText: { fontSize: 12, fontWeight: "600" },
  summary: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 10 },
  summaryTitle: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryLabel: { fontSize: 13 },
  summaryValue: { fontSize: 14, fontWeight: "700" },
  backStepBtn: { paddingVertical: 15, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  backStepText: { fontSize: 15, fontWeight: "700" },
});
