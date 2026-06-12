import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
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
import { EmptyState } from "@/components/EmptyState";

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
  merchant: { id: number; name: string; handle: string; kycLevel: number };
  coin?: { symbol: string; name: string } | null;
}

type Tab = "buy" | "sell";

const METHOD_ICONS: Record<string, string> = {
  upi: "UPI", imps: "IMPS", neft: "NEFT", bank: "Bank",
  paytm: "Paytm", phonepe: "PhonePe", gpay: "GPay",
};

export default function P2PScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState<Tab>("buy");

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const { data: offers, isLoading } = useQuery({
    queryKey: ["p2p-offers", tab],
    queryFn: () => apiFetch<P2pOffer[]>(`/api/p2p/offer?side=${tab === "buy" ? "sell" : "buy"}&coin=USDT`),
    refetchInterval: 15000,
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>P2P Trading</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => isAuthenticated ? null : router.push("/login")}>
          <Feather name="plus-circle" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Buy/Sell toggle */}
      <View style={[styles.tabRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(["buy", "sell"] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && { borderBottomColor: t === "buy" ? colors.success : colors.destructive, borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabLabel, {
              color: tab === t
                ? (t === "buy" ? colors.success : colors.destructive)
                : colors.mutedForeground
            }]}>
              {t === "buy" ? "Buy USDT" : "Sell USDT"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={offers ?? []}
          keyExtractor={(o) => o.id.toString()}
          contentContainerStyle={{ paddingBottom: botPt + 20, flexGrow: 1 }}
          ListHeaderComponent={
            <View style={[styles.colHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.colLabel, { color: colors.mutedForeground, flex: 1.5 }]}>Merchant</Text>
              <Text style={[styles.colLabel, { color: colors.mutedForeground, flex: 1, textAlign: "right" }]}>Price</Text>
              <Text style={[styles.colLabel, { color: colors.mutedForeground, flex: 1, textAlign: "right" }]}>Limit</Text>
              <View style={{ width: 60 }} />
            </View>
          }
          renderItem={({ item: o }) => (
            <View style={[styles.offerRow, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1.5 }}>
                <Text style={[styles.merchantName, { color: colors.foreground }]}>{o.merchant.name}</Text>
                <Text style={[styles.methods, { color: colors.mutedForeground }]}>
                  {o.paymentMethods.slice(0, 2).map((m) => METHOD_ICONS[m] ?? m).join(" · ")}
                </Text>
              </View>
              <View style={{ flex: 1, alignItems: "flex-end" }}>
                <Text style={[styles.offerPrice, { color: tab === "buy" ? colors.success : colors.destructive }]}>
                  ₹{o.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </Text>
                <Text style={[styles.offerCoin, { color: colors.mutedForeground }]}>
                  {o.coin?.symbol ?? "USDT"}
                </Text>
              </View>
              <View style={{ flex: 1, alignItems: "flex-end" }}>
                <Text style={[styles.limitText, { color: colors.foreground }]}>
                  ₹{(o.minFiat / 1000).toFixed(0)}K–{(o.maxFiat / 1000).toFixed(0)}K
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: tab === "buy" ? colors.success : colors.destructive }]}
                onPress={() => isAuthenticated ? null : router.push("/login")}
              >
                <Text style={styles.actionLabel}>{tab === "buy" ? "Buy" : "Sell"}</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <EmptyState icon="users" title="No offers found" subtitle="Be the first to post an offer" />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "700", textAlign: "center" },
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabLabel: { fontSize: 15, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  colHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  colLabel: { fontSize: 11, fontWeight: "600", textTransform: "uppercase" },
  offerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  merchantName: { fontSize: 14, fontWeight: "600" },
  methods: { fontSize: 11, marginTop: 2 },
  offerPrice: { fontSize: 15, fontWeight: "700" },
  offerCoin: { fontSize: 11, marginTop: 2 },
  limitText: { fontSize: 12 },
  actionBtn: {
    width: 52,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  actionLabel: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
