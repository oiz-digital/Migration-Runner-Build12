import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
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
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { usePrices } from "@/hooks/usePrices";
import { apiPost } from "@/hooks/useApi";

const COIN_COLORS: Record<string, string> = {
  BTC: "#f7931a", ETH: "#627eea", BNB: "#f3ba2f", XRP: "#346aa9",
  SOL: "#9945ff", ADA: "#3cc8c8", DOGE: "#c2a633", MATIC: "#8247e5",
  USDT: "#26a17b", DEFAULT: "#6b7a9e",
};

const SLIPPAGE_OPTS = ["0.1", "0.5", "1.0", "2.0"];

export default function ConvertScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { ticks, priceMap } = usePrices();

  const [fromSym, setFromSym] = useState("USDT");
  const [toSym, setToSym] = useState("BTC");
  const [fromAmt, setFromAmt] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [picker, setPicker] = useState<"from" | "to" | null>(null);
  const [success, setSuccess] = useState(false);

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const coins = ticks.filter((t) => t.usdt > 0).map((t) => t.symbol);
  if (!coins.includes("USDT")) coins.unshift("USDT");

  const fromTick = priceMap[fromSym] ?? { usdt: fromSym === "USDT" ? 1 : 0, inr: fromSym === "USDT" ? 85 : 0 };
  const toTick = priceMap[toSym] ?? { usdt: toSym === "USDT" ? 1 : 0, inr: toSym === "USDT" ? 85 : 0 };

  const fromUsdtRate = fromSym === "USDT" ? 1 : (fromTick?.usdt ?? 0);
  const toUsdtRate = toSym === "USDT" ? 1 : (toTick?.usdt ?? 1);
  const rate = toUsdtRate > 0 ? fromUsdtRate / toUsdtRate : 0;

  const fromAmtNum = parseFloat(fromAmt) || 0;
  const toAmt = fromAmtNum * rate * (1 - parseFloat(slippage) / 100);
  const priceImpact = parseFloat(slippage);

  const swapMutation = useMutation({
    mutationFn: () => apiPost("/api/finance/convert", {
      fromSymbol: fromSym,
      toSymbol: toSym,
      fromAmount: fromAmtNum,
      slippage: parseFloat(slippage),
    }),
    onSuccess: () => {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccess(true);
      setFromAmt("");
      void qc.invalidateQueries({ queryKey: ["wallet"] });
      setTimeout(() => setSuccess(false), 3000);
    },
  });

  const handleSwapCoins = () => {
    const tmp = fromSym;
    setFromSym(toSym);
    setToSym(tmp);
    setFromAmt("");
  };

  const renderPicker = () => (
    <Modal visible={!!picker} transparent animationType="slide" onRequestClose={() => setPicker(null)}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPicker(null)}>
        <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Select Coin</Text>
            <TouchableOpacity onPress={() => setPicker(null)}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={coins}
            keyExtractor={(c) => c}
            contentContainerStyle={{ paddingBottom: 40 }}
            renderItem={({ item: c }) => {
              const bg = COIN_COLORS[c] ?? COIN_COLORS.DEFAULT;
              const t = priceMap[c];
              return (
                <TouchableOpacity
                  style={[styles.coinPickRow, { borderBottomColor: colors.border }]}
                  onPress={() => {
                    if (picker === "from") setFromSym(c);
                    else setToSym(c);
                    setPicker(null);
                  }}
                >
                  <View style={[styles.pickIcon, { backgroundColor: bg + "22" }]}>
                    <Text style={[styles.pickIconText, { color: bg }]}>{c.charAt(0)}</Text>
                  </View>
                  <Text style={[styles.pickSym, { color: colors.foreground }]}>{c}</Text>
                  <Text style={[styles.pickPrice, { color: colors.mutedForeground }]}>
                    {t ? `$${t.usdt.toLocaleString("en-US", { maximumFractionDigits: t.usdt < 1 ? 4 : 2 })}` : ""}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Convert</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: botPt + 20 }} keyboardShouldPersistTaps="handled">
        {/* From */}
        <View style={[styles.swapCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.swapCardLabel, { color: colors.mutedForeground }]}>From</Text>
          <View style={styles.swapCardRow}>
            <TouchableOpacity style={[styles.coinSelector, { backgroundColor: colors.muted }]} onPress={() => setPicker("from")}>
              <View style={[styles.coinSelectorIcon, { backgroundColor: (COIN_COLORS[fromSym] ?? COIN_COLORS.DEFAULT) + "22" }]}>
                <Text style={[styles.coinSelectorIconText, { color: COIN_COLORS[fromSym] ?? COIN_COLORS.DEFAULT }]}>{fromSym.charAt(0)}</Text>
              </View>
              <Text style={[styles.coinSelectorLabel, { color: colors.foreground }]}>{fromSym}</Text>
              <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
            <TextInput
              style={[styles.amountInput, { color: colors.foreground }]}
              value={fromAmt}
              onChangeText={setFromAmt}
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
            />
          </View>
          <Text style={[styles.usdEstimate, { color: colors.mutedForeground }]}>
            ≈ ${(fromAmtNum * fromUsdtRate).toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </Text>
        </View>

        {/* Swap arrow */}
        <View style={styles.swapArrowRow}>
          <View style={[styles.swapArrowLine, { backgroundColor: colors.border }]} />
          <TouchableOpacity
            style={[styles.swapArrowBtn, { backgroundColor: colors.primary }]}
            onPress={handleSwapCoins}
          >
            <Feather name="arrow-down" size={18} color="#fff" />
          </TouchableOpacity>
          <View style={[styles.swapArrowLine, { backgroundColor: colors.border }]} />
        </View>

        {/* To */}
        <View style={[styles.swapCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.swapCardLabel, { color: colors.mutedForeground }]}>To (estimated)</Text>
          <View style={styles.swapCardRow}>
            <TouchableOpacity style={[styles.coinSelector, { backgroundColor: colors.muted }]} onPress={() => setPicker("to")}>
              <View style={[styles.coinSelectorIcon, { backgroundColor: (COIN_COLORS[toSym] ?? COIN_COLORS.DEFAULT) + "22" }]}>
                <Text style={[styles.coinSelectorIconText, { color: COIN_COLORS[toSym] ?? COIN_COLORS.DEFAULT }]}>{toSym.charAt(0)}</Text>
              </View>
              <Text style={[styles.coinSelectorLabel, { color: colors.foreground }]}>{toSym}</Text>
              <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
            <Text style={[styles.toAmount, { color: fromAmtNum > 0 ? colors.success : colors.mutedForeground }]}>
              {fromAmtNum > 0 ? toAmt.toFixed(toAmt < 0.01 ? 8 : 4) : "—"}
            </Text>
          </View>
          <Text style={[styles.usdEstimate, { color: colors.mutedForeground }]}>
            {fromAmtNum > 0 ? `≈ $${(toAmt * toUsdtRate).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : ""}
          </Text>
        </View>

        {/* Rate info */}
        {rate > 0 && (
          <View style={[styles.rateBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <View style={styles.rateRow}>
              <Text style={[styles.rateLabel, { color: colors.mutedForeground }]}>Exchange Rate</Text>
              <Text style={[styles.rateValue, { color: colors.foreground }]}>
                1 {fromSym} ≈ {rate.toFixed(rate < 0.01 ? 8 : 4)} {toSym}
              </Text>
            </View>
            <View style={styles.rateRow}>
              <Text style={[styles.rateLabel, { color: colors.mutedForeground }]}>Price Impact</Text>
              <Text style={[styles.rateValue, { color: parseFloat(slippage) > 1 ? colors.warning : colors.success }]}>
                ~{slippage}%
              </Text>
            </View>
          </View>
        )}

        {/* Slippage */}
        <View>
          <Text style={[styles.slippageTitle, { color: colors.foreground }]}>Slippage Tolerance</Text>
          <View style={styles.slippageRow}>
            {SLIPPAGE_OPTS.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.slipBtn, { borderColor: s === slippage ? colors.primary : colors.border }, s === slippage && { backgroundColor: colors.primary + "20" }]}
                onPress={() => setSlippage(s)}
              >
                <Text style={[styles.slipLabel, { color: s === slippage ? colors.primary : colors.mutedForeground }]}>{s}%</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {success && (
          <View style={[styles.successBox, { backgroundColor: colors.success + "20", borderColor: colors.success + "40" }]}>
            <Feather name="check-circle" size={18} color={colors.success} />
            <Text style={[styles.successText, { color: colors.success }]}>Conversion successful!</Text>
          </View>
        )}

        {swapMutation.isError && (
          <View style={[styles.successBox, { backgroundColor: colors.destructive + "20", borderColor: colors.destructive + "40" }]}>
            <Feather name="alert-circle" size={18} color={colors.destructive} />
            <Text style={[styles.successText, { color: colors.destructive }]}>{(swapMutation.error as Error).message}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.convertBtn, { backgroundColor: colors.primary }, (!fromAmt || parseFloat(fromAmt) <= 0 || swapMutation.isPending) && { opacity: 0.5 }]}
          onPress={() => {
            if (!isAuthenticated) { router.push("/login"); return; }
            swapMutation.mutate();
          }}
          disabled={!fromAmt || parseFloat(fromAmt) <= 0 || swapMutation.isPending}
        >
          {swapMutation.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.convertBtnLabel}>
              {isAuthenticated ? `Convert ${fromSym} → ${toSym}` : "Login to Convert"}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {renderPicker()}
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
  swapCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  swapCardLabel: { fontSize: 12, fontWeight: "600" },
  swapCardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  coinSelector: { flexDirection: "row", alignItems: "center", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
  coinSelectorIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  coinSelectorIconText: { fontSize: 13, fontWeight: "700" },
  coinSelectorLabel: { fontSize: 15, fontWeight: "700" },
  amountInput: { flex: 1, fontSize: 22, fontWeight: "800", textAlign: "right" },
  toAmount: { flex: 1, fontSize: 22, fontWeight: "800", textAlign: "right" },
  usdEstimate: { fontSize: 12, textAlign: "right" },
  swapArrowRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  swapArrowLine: { flex: 1, height: StyleSheet.hairlineWidth },
  swapArrowBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  rateBox: { borderRadius: 10, borderWidth: 1, padding: 12, gap: 8 },
  rateRow: { flexDirection: "row", justifyContent: "space-between" },
  rateLabel: { fontSize: 13 },
  rateValue: { fontSize: 13, fontWeight: "600" },
  slippageTitle: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  slippageRow: { flexDirection: "row", gap: 8 },
  slipBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  slipLabel: { fontSize: 13, fontWeight: "700" },
  successBox: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 10, borderWidth: 1, gap: 10 },
  successText: { fontSize: 14, fontWeight: "600", flex: 1 },
  convertBtn: { height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 8 },
  convertBtnLabel: { color: "#fff", fontSize: 16, fontWeight: "800" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "70%", paddingTop: 8 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  modalTitle: { fontSize: 16, fontWeight: "700" },
  coinPickRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  pickIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  pickIconText: { fontSize: 16, fontWeight: "700" },
  pickSym: { flex: 1, fontSize: 15, fontWeight: "600" },
  pickPrice: { fontSize: 13 },
});
