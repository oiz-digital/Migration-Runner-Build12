import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
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

interface INRTx {
  id: number;
  type: "deposit" | "withdrawal";
  amount: string;
  status: "pending" | "completed" | "failed";
  method: string;
  reference?: string;
  createdAt: string;
  completedAt?: string;
}

interface BankAccount {
  id: number;
  accountHolder: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  isDefault: boolean;
}

const METHODS_DEPOSIT = [
  { key: "upi", label: "UPI", icon: "zap" as const, color: "#627eea", desc: "Instant transfer via UPI ID" },
  { key: "imps", label: "IMPS", icon: "repeat" as const, color: "#0ECB81", desc: "Instant bank transfer (24/7)" },
  { key: "neft", label: "NEFT", icon: "clock" as const, color: "#f59e0b", desc: "Bank transfer (2-4 hours)" },
  { key: "rtgs", label: "RTGS", icon: "trending-up" as const, color: "#9945ff", desc: "Large transfers above ₹2L" },
];

const STATUS_META = {
  pending: { color: "#f59e0b", label: "Pending", icon: "clock" as const },
  completed: { color: "#0ECB81", label: "Completed", icon: "check-circle" as const },
  failed: { color: "#F6465D", label: "Failed", icon: "x-circle" as const },
};

function fmtINR(n: string | number) {
  const v = parseFloat(String(n));
  if (isNaN(v)) return "₹0";
  return "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export default function INRPaymentsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const qc = useQueryClient();

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const [tab, setTab] = useState<"deposit" | "withdraw" | "history">("deposit");
  const [method, setMethod] = useState("upi");
  const [amount, setAmount] = useState("");
  const [upiId, setUpiId] = useState("");
  const [showBankModal, setShowBankModal] = useState(false);
  const [selectedBank, setSelectedBank] = useState<BankAccount | null>(null);

  const txQ = useQuery<{ transactions: INRTx[] }>({
    queryKey: ["inr-transactions"],
    queryFn: () => apiFetch("/api/finance/transaction?type=fiat&limit=30"),
    enabled: isAuthenticated && tab === "history",
  });

  const banksQ = useQuery<{ accounts: BankAccount[] }>({
    queryKey: ["bank-accounts"],
    queryFn: () => apiFetch("/api/user/bank-account"),
    enabled: isAuthenticated,
  });

  const depositMut = useMutation({
    mutationFn: () => apiPost("/api/finance/deposit/fiat", { amount: parseFloat(amount), method, upiId }),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["inr-transactions"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Deposit Initiated",
        `Reference: ${d?.reference ?? "—"}\n\nTransfer ${fmtINR(amount)} to the account details provided. It will reflect within ${method === "upi" ? "a few minutes" : method === "imps" ? "30 minutes" : "2-4 hours"}.`,
      );
      setAmount("");
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const withdrawMut = useMutation({
    mutationFn: () => apiPost("/api/finance/withdraw/fiat", {
      amount: parseFloat(amount),
      bankAccountId: selectedBank?.id,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inr-transactions"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Withdrawal Submitted", "Your withdrawal will be processed within 1-2 business days");
      setAmount(""); setSelectedBank(null);
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const quickAmounts = ["500", "1000", "5000", "10000", "25000", "50000"];
  const banks = banksQ.data?.accounts ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={["#001a0e", "#080e1a"]} style={[styles.header, { paddingTop: topPt + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>INR Payments</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {(["deposit", "withdraw", "history"] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tabBtn, { borderColor: t === tab ? colors.primary : colors.border, backgroundColor: t === tab ? colors.primary + "15" : colors.card }]} onPress={() => setTab(t)}>
            <Text style={[styles.tabLabel, { color: t === tab ? colors.primary : colors.mutedForeground }]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "deposit" && (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: botPt + 30 }} showsVerticalScrollIndicator={false}>
          {/* Method selector */}
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>DEPOSIT METHOD</Text>
          <View style={styles.methodGrid}>
            {METHODS_DEPOSIT.map((m) => (
              <TouchableOpacity
                key={m.key}
                style={[styles.methodCard, { backgroundColor: colors.card, borderColor: m.key === method ? m.color : colors.border }]}
                onPress={() => setMethod(m.key)}
              >
                <View style={[styles.methodIcon, { backgroundColor: m.color + "20" }]}>
                  <Feather name={m.icon} size={20} color={m.color} />
                </View>
                <Text style={[styles.methodLabel, { color: m.key === method ? m.color : colors.foreground }]}>{m.label}</Text>
                <Text style={[styles.methodDesc, { color: colors.mutedForeground }]}>{m.desc}</Text>
                {m.key === method && (
                  <View style={[styles.methodCheck, { backgroundColor: m.color }]}>
                    <Feather name="check" size={10} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {method === "upi" && (
            <>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>YOUR UPI ID (Optional)</Text>
              <TextInput
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                placeholder="e.g. yourname@upi"
                placeholderTextColor={colors.mutedForeground}
                value={upiId}
                onChangeText={setUpiId}
                keyboardType="email-address"
              />
            </>
          )}

          {/* Amount */}
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>AMOUNT (₹)</Text>
          <View style={[styles.amtBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.amtCurrency, { color: colors.mutedForeground }]}>₹</Text>
            <TextInput
              style={[styles.amtInput, { color: colors.foreground }]}
              placeholder="0"
              placeholderTextColor={colors.mutedForeground}
              value={amount}
              onChangeText={setAmount}
              keyboardType="number-pad"
            />
          </View>

          {/* Quick amounts */}
          <View style={styles.quickRow}>
            {quickAmounts.map((q) => (
              <TouchableOpacity key={q} style={[styles.quickChip, { backgroundColor: colors.card, borderColor: amount === q ? colors.primary : colors.border }]} onPress={() => setAmount(q)}>
                <Text style={[styles.quickLabel, { color: amount === q ? colors.primary : colors.mutedForeground }]}>₹{parseInt(q) >= 1000 ? `${parseInt(q) / 1000}K` : q}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Bank details to transfer to */}
          <View style={[styles.bankDetails, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.bankDetailsHeader}>
              <Feather name="info" size={16} color={colors.primary} />
              <Text style={[styles.bankDetailsTitle, { color: colors.foreground }]}>Transfer To</Text>
            </View>
            {[
              { label: "Account Name", value: "Zebvix Technologies Pvt Ltd" },
              { label: "Account Number", value: "1234567890123456" },
              { label: "IFSC Code", value: "HDFC0001234" },
              { label: "Bank", value: "HDFC Bank" },
              { label: "Ref", value: `DEP-${Date.now().toString().slice(-8)}` },
            ].map((r) => (
              <View key={r.label} style={styles.bankRow}>
                <Text style={[styles.bankLabel, { color: colors.mutedForeground }]}>{r.label}</Text>
                <TouchableOpacity
                  style={styles.bankValueRow}
                  onPress={async () => {
                    await Clipboard.setStringAsync(r.value);
                    Haptics.selectionAsync();
                  }}
                >
                  <Text style={[styles.bankValue, { color: colors.foreground }]}>{r.value}</Text>
                  <Feather name="copy" size={12} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.primary, opacity: (!amount || depositMut.isPending) ? 0.6 : 1 }]}
            onPress={() => depositMut.mutate()}
            disabled={!amount || depositMut.isPending}
          >
            {depositMut.isPending ? <ActivityIndicator color="#fff" /> : (
              <>
                <Feather name="arrow-down-circle" size={18} color="#fff" />
                <Text style={styles.actionBtnLabel}>Initiate Deposit {amount ? fmtINR(amount) : ""}</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      {tab === "withdraw" && (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: botPt + 30 }} showsVerticalScrollIndicator={false}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>BANK ACCOUNT</Text>
          <TouchableOpacity
            style={[styles.bankSelector, { backgroundColor: colors.card, borderColor: selectedBank ? colors.primary : colors.border }]}
            onPress={() => setShowBankModal(true)}
          >
            {selectedBank ? (
              <View style={{ flex: 1 }}>
                <Text style={[styles.bankSelectorName, { color: colors.foreground }]}>{selectedBank.accountHolder}</Text>
                <Text style={[styles.bankSelectorMeta, { color: colors.mutedForeground }]}>
                  {selectedBank.bankName} · XXXX{selectedBank.accountNumber.slice(-4)}
                </Text>
              </View>
            ) : (
              <Text style={[{ color: colors.mutedForeground, flex: 1 }]}>Select bank account</Text>
            )}
            <Feather name="chevron-down" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>WITHDRAWAL AMOUNT (₹)</Text>
          <View style={[styles.amtBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.amtCurrency, { color: colors.mutedForeground }]}>₹</Text>
            <TextInput
              style={[styles.amtInput, { color: colors.foreground }]}
              placeholder="0"
              placeholderTextColor={colors.mutedForeground}
              value={amount}
              onChangeText={setAmount}
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.quickRow}>
            {quickAmounts.map((q) => (
              <TouchableOpacity key={q} style={[styles.quickChip, { backgroundColor: colors.card, borderColor: amount === q ? colors.primary : colors.border }]} onPress={() => setAmount(q)}>
                <Text style={[styles.quickLabel, { color: amount === q ? colors.primary : colors.mutedForeground }]}>₹{parseInt(q) >= 1000 ? `${parseInt(q) / 1000}K` : q}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.infoBox, { backgroundColor: "#f59e0b15", borderColor: "#f59e0b40" }]}>
            <Feather name="alert-triangle" size={16} color="#f59e0b" />
            <Text style={{ color: "#f59e0b", fontSize: 12, flex: 1, lineHeight: 18 }}>
              Withdrawals require KYC Level 2. Processing takes 1-2 business days. Minimum ₹100.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#F6465D", opacity: (!amount || !selectedBank || withdrawMut.isPending) ? 0.6 : 1 }]}
            onPress={() => withdrawMut.mutate()}
            disabled={!amount || !selectedBank || withdrawMut.isPending}
          >
            {withdrawMut.isPending ? <ActivityIndicator color="#fff" /> : (
              <>
                <Feather name="arrow-up-circle" size={18} color="#fff" />
                <Text style={styles.actionBtnLabel}>Withdraw {amount ? fmtINR(amount) : ""}</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      {tab === "history" && (
        txQ.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
        ) : (txQ.data?.transactions ?? []).length === 0 ? (
          <EmptyState icon="clock" title="No INR transactions" subtitle="Deposit or withdraw INR to see history" />
        ) : (
          <FlatList
            data={txQ.data?.transactions ?? []}
            keyExtractor={(t) => String(t.id)}
            contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: botPt + 30 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: t }) => {
              const sm = STATUS_META[t.status];
              return (
                <View style={[styles.txCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[styles.txIcon, { backgroundColor: (t.type === "deposit" ? "#0ECB81" : "#F6465D") + "20" }]}>
                    <Feather name={t.type === "deposit" ? "arrow-down-circle" : "arrow-up-circle"} size={20} color={t.type === "deposit" ? "#0ECB81" : "#F6465D"} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.txTop}>
                      <Text style={[styles.txType, { color: colors.foreground }]}>
                        {t.type === "deposit" ? "INR Deposit" : "INR Withdrawal"}
                      </Text>
                      <Text style={[styles.txAmt, { color: t.type === "deposit" ? "#0ECB81" : "#F6465D" }]}>
                        {t.type === "deposit" ? "+" : "-"}{fmtINR(t.amount)}
                      </Text>
                    </View>
                    <View style={styles.txBot}>
                      <View style={[styles.txStatus, { backgroundColor: sm.color + "20" }]}>
                        <Feather name={sm.icon} size={10} color={sm.color} />
                        <Text style={{ color: sm.color, fontSize: 10, fontWeight: "700" }}>{sm.label}</Text>
                      </View>
                      <Text style={[styles.txDate, { color: colors.mutedForeground }]}>
                        {new Date(t.createdAt).toLocaleDateString("en-IN")}
                      </Text>
                    </View>
                    {t.reference && (
                      <Text style={[styles.txRef, { color: colors.mutedForeground }]}>Ref: {t.reference}</Text>
                    )}
                  </View>
                </View>
              );
            }}
          />
        )
      )}

      {/* Bank selection modal */}
      <Modal visible={showBankModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Select Bank Account</Text>
            {banks.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 30 }}>
                <Feather name="credit-card" size={36} color={colors.mutedForeground} />
                <Text style={[{ color: colors.mutedForeground, marginTop: 12, textAlign: "center" }]}>
                  No bank accounts added yet. Add one from Settings.
                </Text>
              </View>
            ) : (
              banks.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.bankOption, { borderColor: selectedBank?.id === b.id ? colors.primary : colors.border }]}
                  onPress={() => { setSelectedBank(b); setShowBankModal(false); }}
                >
                  <View style={[styles.bankOptionIcon, { backgroundColor: colors.primary + "20" }]}>
                    <Feather name="credit-card" size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[{ color: colors.foreground, fontWeight: "700" }]}>{b.accountHolder}</Text>
                    <Text style={[{ color: colors.mutedForeground, fontSize: 12 }]}>
                      {b.bankName} · XXXX{b.accountNumber.slice(-4)} · {b.ifsc}
                    </Text>
                  </View>
                  {b.isDefault && (
                    <View style={[styles.defaultBadge, { backgroundColor: colors.primary + "20" }]}>
                      <Text style={{ color: colors.primary, fontSize: 10, fontWeight: "700" }}>Default</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))
            )}
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.muted, marginTop: 8 }]} onPress={() => setShowBankModal(false)}>
              <Text style={{ color: colors.foreground, fontWeight: "700" }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700" },
  tabRow: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  tabLabel: { fontSize: 13, fontWeight: "600" },
  fieldLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  methodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  methodCard: { width: "47%", borderRadius: 14, borderWidth: 1.5, padding: 14, alignItems: "center", gap: 6, position: "relative" },
  methodIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  methodLabel: { fontSize: 14, fontWeight: "700" },
  methodDesc: { fontSize: 10, textAlign: "center" },
  methodCheck: { position: "absolute", top: 8, right: 8, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  input: { borderWidth: 1, borderRadius: 10, padding: 13, fontSize: 15 },
  amtBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 14 },
  amtCurrency: { fontSize: 22, fontWeight: "700", marginRight: 4 },
  amtInput: { flex: 1, fontSize: 28, fontWeight: "800", paddingVertical: 14 },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  quickLabel: { fontSize: 13, fontWeight: "600" },
  bankDetails: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  bankDetailsHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  bankDetailsTitle: { fontSize: 15, fontWeight: "700" },
  bankRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bankLabel: { fontSize: 12 },
  bankValueRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  bankValue: { fontSize: 13, fontWeight: "600" },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 14 },
  actionBtnLabel: { color: "#fff", fontWeight: "800", fontSize: 16 },
  bankSelector: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  bankSelectorName: { fontSize: 15, fontWeight: "700" },
  bankSelectorMeta: { fontSize: 12, marginTop: 2 },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 10, borderWidth: 1, padding: 12 },
  txCard: { borderRadius: 12, borderWidth: 1, padding: 12, flexDirection: "row", gap: 12, alignItems: "flex-start" },
  txIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  txTop: { flexDirection: "row", justifyContent: "space-between" },
  txType: { fontSize: 14, fontWeight: "600" },
  txAmt: { fontSize: 14, fontWeight: "700" },
  txBot: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  txStatus: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  txDate: { fontSize: 11 },
  txRef: { fontSize: 10, marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: "#000000cc", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 36, height: 4, backgroundColor: "#ffffff30", borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 16 },
  bankOption: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, padding: 14, gap: 12, marginBottom: 8 },
  bankOptionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  defaultBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
});
