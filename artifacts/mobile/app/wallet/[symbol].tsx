import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { usePrices } from "@/hooks/usePrices";
import { apiFetch, apiPost } from "@/hooks/useApi";

interface WalletItem {
  symbol: string;
  balance: string;
  locked: string;
  address?: string;
}
interface WalletResponse { wallets: WalletItem[] }

type Tab = "deposit" | "withdraw";

const COIN_COLORS: Record<string, string> = {
  BTC: "#f7931a", ETH: "#627eea", BNB: "#f3ba2f", XRP: "#346aa9",
  SOL: "#9945ff", ADA: "#3cc8c8", USDT: "#26a17b", INR: "#ff9933",
  DEFAULT: "#6b7a9e",
};

export default function WalletDetailScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { priceMap, inrRate } = usePrices();
  const [tab, setTab] = useState<Tab>("deposit");
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState("ERC20");

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const sym = symbol?.toUpperCase() ?? "BTC";
  const bg = COIN_COLORS[sym] ?? COIN_COLORS.DEFAULT;

  const { data: walletData } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => apiFetch<WalletResponse>("/api/finance/wallet"),
    enabled: isAuthenticated,
  });

  const wallet = walletData?.wallets?.find((w) => w.symbol.toUpperCase() === sym);
  const balance = parseFloat(wallet?.balance ?? "0");
  const tick = priceMap[sym];
  const pxInr = sym === "INR" ? 1 : (tick?.inr ?? (tick?.usdt ?? 0) * inrRate);
  const valueInr = balance * pxInr;

  const withdrawMutation = useMutation({
    mutationFn: () => apiPost("/api/finance/withdraw/spot", { symbol: sym, amount: parseFloat(amount), address, network }),
    onSuccess: () => {
      setAmount("");
      setAddress("");
      void qc.invalidateQueries({ queryKey: ["wallet"] });
      if (Platform.OS !== "web") {
        Alert.alert("Success", "Withdrawal request submitted");
      }
    },
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>{sym} Wallet</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: botPt + 20 }} keyboardShouldPersistTaps="handled">
        {/* Balance card */}
        <View style={[styles.balCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.coinIcon, { backgroundColor: bg + "22" }]}>
            <Text style={[styles.coinLetter, { color: bg }]}>{sym.charAt(0)}</Text>
          </View>
          <Text style={[styles.balLabel, { color: colors.mutedForeground }]}>Available Balance</Text>
          <Text style={[styles.balValue, { color: colors.foreground }]}>
            {balance.toFixed(balance < 0.001 ? 8 : 4)} {sym}
          </Text>
          <Text style={[styles.balInr, { color: colors.mutedForeground }]}>
            ≈ ₹{valueInr.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </Text>
        </View>

        {/* Tab toggle */}
        <View style={[styles.tabRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          {(["deposit", "withdraw"] as Tab[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tabBtn, tab === t && { backgroundColor: colors.primary }]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.tabLabel, { color: tab === t ? "#fff" : colors.mutedForeground }]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.formSection}>
          {tab === "deposit" ? (
            <View style={styles.depositInfo}>
              <View style={[styles.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="info" size={16} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoTitle, { color: colors.foreground }]}>
                    Deposit {sym}
                  </Text>
                  <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
                    Send only {sym} to this address. Sending other coins may result in permanent loss.
                  </Text>
                </View>
              </View>
              {/* Network selector */}
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Network</Text>
              <View style={styles.networkRow}>
                {["ERC20", "BEP20", "TRC20"].map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.networkBtn, { borderColor: network === n ? colors.primary : colors.border }, network === n && { backgroundColor: colors.primary + "20" }]}
                    onPress={() => setNetwork(n)}
                  >
                    <Text style={[styles.networkLabel, { color: network === n ? colors.primary : colors.mutedForeground }]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={[styles.addressBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={[styles.addressText, { color: colors.foreground }]}>
                  {wallet?.address ?? "Address will appear after you navigate to the deposit page on the web portal"}
                </Text>
                <TouchableOpacity onPress={() => {}}>
                  <Feather name="copy" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.minDeposit, { color: colors.mutedForeground }]}>
                Min deposit: 0.001 {sym} • 1 confirmation required
              </Text>
            </View>
          ) : (
            <View style={styles.withdrawForm}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Network</Text>
              <View style={styles.networkRow}>
                {["ERC20", "BEP20", "TRC20"].map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.networkBtn, { borderColor: network === n ? colors.primary : colors.border }, network === n && { backgroundColor: colors.primary + "20" }]}
                    onPress={() => setNetwork(n)}
                  >
                    <Text style={[styles.networkLabel, { color: network === n ? colors.primary : colors.mutedForeground }]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Recipient Address</Text>
              <View style={[styles.inputField, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.inputText, { color: colors.foreground }]}
                  value={address}
                  onChangeText={setAddress}
                  placeholder={`Enter ${sym} address`}
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Amount</Text>
              <View style={[styles.inputField, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.inputText, { color: colors.foreground }]}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                />
                <TouchableOpacity onPress={() => setAmount(balance.toFixed(4))}>
                  <Text style={[styles.maxBtn, { color: colors.primary }]}>MAX</Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.minDeposit, { color: colors.mutedForeground }]}>
                Available: {balance.toFixed(4)} {sym} • Fee: 0.001 {sym}
              </Text>

              {withdrawMutation.isError && (
                <View style={[styles.errorBox, { backgroundColor: colors.destructive + "15", borderColor: colors.destructive + "40" }]}>
                  <Text style={[styles.errorText, { color: colors.destructive }]}>
                    {(withdrawMutation.error as Error).message}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.withdrawBtn, { backgroundColor: colors.primary }, (withdrawMutation.isPending || !amount || !address) && { opacity: 0.5 }]}
                onPress={() => withdrawMutation.mutate()}
                disabled={withdrawMutation.isPending || !amount || !address}
              >
                <Text style={styles.withdrawBtnLabel}>
                  {withdrawMutation.isPending ? "Processing..." : `Withdraw ${sym}`}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  balCard: {
    margin: 16,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    gap: 4,
  },
  coinIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  coinLetter: { fontSize: 26, fontWeight: "700" },
  balLabel: { fontSize: 13 },
  balValue: { fontSize: 24, fontWeight: "800", marginTop: 4 },
  balInr: { fontSize: 14 },
  tabRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
    gap: 3,
    marginBottom: 16,
  },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  tabLabel: { fontSize: 14, fontWeight: "700" },
  formSection: { paddingHorizontal: 16 },
  depositInfo: { gap: 12 },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  infoTitle: { fontSize: 14, fontWeight: "700", marginBottom: 4 },
  infoText: { fontSize: 12, lineHeight: 16 },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginTop: 8, marginBottom: 4 },
  networkRow: { flexDirection: "row", gap: 8 },
  networkBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  networkLabel: { fontSize: 13, fontWeight: "600" },
  addressBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
    marginTop: 8,
  },
  addressText: { flex: 1, fontSize: 12, fontFamily: "monospace" },
  minDeposit: { fontSize: 12, marginTop: 4 },
  withdrawForm: { gap: 4 },
  inputField: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 4,
  },
  inputText: { flex: 1, fontSize: 15 },
  maxBtn: { fontSize: 13, fontWeight: "700" },
  errorBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  errorText: { fontSize: 13 },
  withdrawBtn: { marginTop: 12, padding: 14, borderRadius: 10, alignItems: "center" },
  withdrawBtnLabel: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
