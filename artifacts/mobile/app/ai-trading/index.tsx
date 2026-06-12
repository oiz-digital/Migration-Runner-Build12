import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
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

interface AIPlan {
  id: number;
  name: string;
  description: string;
  roi: string;
  duration: number;
  minInvestment: string;
  maxInvestment: string;
  currency: string;
  status: string;
  riskLevel?: string;
  profitPercentage?: string;
}

interface AISub {
  id: number;
  plan: AIPlan;
  amount: string;
  profit: string;
  status: string;
  createdAt: string;
}

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

type Tab = "plans" | "my" | "chat";

interface AIChatResponse { reply: string }

const RISK_META: Record<string, { color: string; icon: keyof typeof Feather.glyphMap; label: string }> = {
  low: { color: "#22c55e", icon: "shield", label: "Low Risk" },
  medium: { color: "#f59e0b", icon: "activity", label: "Medium Risk" },
  high: { color: "#ef4444", icon: "zap", label: "High Risk" },
};

const QUICK_PROMPTS = [
  "Best plan for ₹10,000 investment?",
  "How do AI bots make profit?",
  "What is risk level in trading?",
  "Compare low vs high risk plans",
  "How to cancel my investment?",
];

const AI_RESPONSES: Record<string, string> = {
  default: "I'm your Zebvix AI trading assistant. I can help you choose the right AI plan, understand risks, and maximise your returns. What would you like to know?",
  "Best plan for ₹10,000 investment?": "For ₹10,000, I recommend starting with a **Low Risk plan**. These typically offer 5–12% ROI over 30 days with minimal drawdown. The Smart Growth plan is ideal — consistent returns, FD-like stability, and you can withdraw after maturity. Want me to show you the details?",
  "How do AI bots make profit?": "Our AI bots use a combination of:\n• **Trend following** — ride momentum in major crypto pairs\n• **Mean reversion** — exploit price oscillations around moving averages\n• **Arbitrage** — capture small price gaps across exchanges\n• **ML signals** — proprietary models trained on 5 years of order flow data\n\nAll strategies run 24/7 with strict stop-losses.",
  "What is risk level in trading?": "Risk levels indicate volatility and potential drawdown:\n• **Low** — ±2–5% max drawdown, steady compounding (~8–15% APY)\n• **Medium** — ±10–20% swings, higher returns (~20–40% APY)\n• **High** — ±30–50% possible, aggressive returns (~50–100% APY)\n\nChoose based on how much loss you can tolerate without panic-selling.",
  "Compare low vs high risk plans": "| Feature | Low Risk | High Risk |\n|---|---|---|\n| APY | 8–15% | 50–100%+ |\n| Drawdown | <5% | Up to 50% |\n| Strategy | DCA + stable pairs | Leveraged + altcoins |\n| Best for | Capital preservation | Aggressive growth |\n\nMost beginners should start Low Risk and upgrade after 3 months.",
  "How to cancel my investment?": "You can cancel an active AI investment from the **My Investments** tab:\n1. Tap on your active subscription\n2. Press 'Cancel Subscription'\n3. Funds return to your spot wallet within 24 hours\n\nNote: Early cancellation may forfeit accrued profits for that period.",
};

export default function AITradingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState<Tab>("plans");
  const [modal, setModal] = useState<AIPlan | null>(null);
  const [investAmt, setInvestAmt] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([
    { role: "assistant", content: AI_RESPONSES.default, ts: Date.now() },
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const flatRef = useRef<FlatList>(null);

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const { data: plans, isLoading } = useQuery({
    queryKey: ["ai-plans"],
    queryFn: () => apiFetch<AIPlan[]>("/api/ai/plan"),
    staleTime: 60_000,
  });

  const { data: mySubs } = useQuery({
    queryKey: ["ai-subs"],
    queryFn: () => apiFetch<AISub[]>("/api/ai/investment"),
    enabled: isAuthenticated,
  });

  const subscribeMutation = useMutation({
    mutationFn: (body: object) => apiPost("/api/ai/investment", body),
    onSuccess: () => {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModal(null);
      setInvestAmt("");
      void qc.invalidateQueries({ queryKey: ["ai-subs"] });
    },
  });

  const sendChat = async (text?: string) => {
    const msg = text ?? chatInput.trim();
    if (!msg) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const userMsg: ChatMsg = { role: "user", content: msg, ts: Date.now() };
    const history = [...chatMsgs, userMsg];
    setChatMsgs(history);
    setChatInput("");
    setChatLoading(true);
    try {
      const data = await apiPost<AIChatResponse>("/api/ai/chat", {
        messages: history.map((m) => ({ role: m.role, content: m.content })),
      });
      setChatMsgs((p) => [...p, { role: "assistant", content: data.reply, ts: Date.now() }]);
    } catch {
      setChatMsgs((p) => [...p, {
        role: "assistant",
        content: "Sorry, I'm having trouble connecting right now. Please try again in a moment.",
        ts: Date.now(),
      }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const activePlans = (plans ?? []).filter((p) => p.status === "active");
  const totalProfit = (mySubs ?? []).reduce((s, sub) => s + parseFloat(sub.profit || "0"), 0);
  const totalInvested = (mySubs ?? []).reduce((s, sub) => s + parseFloat(sub.amount || "0"), 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>AI Trading</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Hero */}
      <LinearGradient colors={["#0e0820", "#0d1524"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>AI-Powered Trading Bots</Text>
          <Text style={styles.heroSub}>Automated strategies, algorithmic execution, consistent returns</Text>
          {isAuthenticated && totalInvested > 0 && (
            <View style={styles.statsRow}>
              <View style={styles.statChip}>
                <Feather name="dollar-sign" size={11} color={colors.primary} />
                <Text style={[styles.statChipText, { color: colors.primary }]}>${totalInvested.toFixed(2)} invested</Text>
              </View>
              <View style={styles.statChip}>
                <Feather name="trending-up" size={11} color="#22c55e" />
                <Text style={[styles.statChipText, { color: "#22c55e" }]}>+${totalProfit.toFixed(4)} profit</Text>
              </View>
            </View>
          )}
        </View>
        <View style={[styles.heroIcon, { backgroundColor: "#9945ff20" }]}>
          <Feather name="cpu" size={32} color="#9945ff" />
        </View>
      </LinearGradient>

      {/* Tabs */}
      <View style={[styles.tabRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(["plans", "my", "chat"] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, t === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}
          >
            <Feather
              name={t === "plans" ? "cpu" : t === "my" ? "bar-chart-2" : "message-circle"}
              size={14}
              color={t === tab ? colors.primary : colors.mutedForeground}
            />
            <Text style={[styles.tabLabel, { color: t === tab ? colors.primary : colors.mutedForeground }]}>
              {t === "plans" ? "AI Plans" : t === "my" ? "My Investments" : "AI Chat"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Plans tab */}
      {tab === "plans" && (
        isLoading ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
        ) : activePlans.length === 0 ? (
          <EmptyState icon="cpu" title="No plans available" subtitle="AI trading plans coming soon" />
        ) : (
          <FlatList
            data={activePlans}
            keyExtractor={(p) => p.id.toString()}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: botPt + 20 }}
            renderItem={({ item: p }) => {
              const roi = parseFloat(p.roi || p.profitPercentage || "0");
              const risk = (p.riskLevel ?? "medium").toLowerCase();
              const riskMeta = RISK_META[risk] ?? RISK_META.medium;
              return (
                <View style={[styles.planCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <LinearGradient colors={[riskMeta.color + "10", "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
                  <View style={styles.planTop}>
                    <View style={[styles.planIconWrap, { backgroundColor: riskMeta.color + "20" }]}>
                      <Feather name={riskMeta.icon} size={22} color={riskMeta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.planName, { color: colors.foreground }]}>{p.name}</Text>
                      <View style={[styles.riskBadge, { backgroundColor: riskMeta.color + "20" }]}>
                        <Text style={[styles.riskBadgeText, { color: riskMeta.color }]}>{riskMeta.label}</Text>
                      </View>
                    </View>
                    <View style={styles.planRoiWrap}>
                      <Text style={[styles.planRoiVal, { color: riskMeta.color }]}>+{roi.toFixed(1)}%</Text>
                      <Text style={[styles.planRoiLbl, { color: colors.mutedForeground }]}>in {p.duration}d</Text>
                    </View>
                  </View>
                  {p.description && (
                    <Text style={[styles.planDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{p.description}</Text>
                  )}
                  <View style={styles.planStats}>
                    {[
                      { label: "Min Invest", value: `${parseFloat(p.minInvestment).toFixed(0)} ${p.currency}` },
                      { label: "Duration", value: `${p.duration}d` },
                      { label: "Currency", value: p.currency },
                    ].map((s) => (
                      <View key={s.label} style={[styles.planStat, { backgroundColor: colors.muted }]}>
                        <Text style={[styles.planStatVal, { color: colors.foreground }]}>{s.value}</Text>
                        <Text style={[styles.planStatLbl, { color: colors.mutedForeground }]}>{s.label}</Text>
                      </View>
                    ))}
                  </View>
                  <TouchableOpacity
                    style={[styles.investBtn, { backgroundColor: riskMeta.color }]}
                    onPress={() => {
                      if (!isAuthenticated) { router.push("/login"); return; }
                      setModal(p); setInvestAmt("");
                    }}
                  >
                    <Feather name="trending-up" size={14} color="#fff" />
                    <Text style={styles.investBtnLabel}>Invest Now</Text>
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )
      )}

      {/* My investments tab */}
      {tab === "my" && (
        <FlatList
          data={mySubs ?? []}
          keyExtractor={(s) => s.id.toString()}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: botPt + 20, flexGrow: 1 }}
          ListEmptyComponent={
            !isAuthenticated
              ? <EmptyState icon="lock" title="Login required" />
              : <EmptyState icon="cpu" title="No investments yet" subtitle="Pick an AI plan to start earning" />
          }
          renderItem={({ item: sub }) => {
            const profit = parseFloat(sub.profit || "0");
            const amt = parseFloat(sub.amount || "0");
            const risk = (sub.plan?.riskLevel ?? "medium").toLowerCase();
            const meta = RISK_META[risk] ?? RISK_META.medium;
            const roi = amt > 0 ? (profit / amt) * 100 : 0;
            return (
              <View style={[styles.subCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <LinearGradient colors={[meta.color + "08", "transparent"]} style={StyleSheet.absoluteFillObject} />
                <View style={styles.subTop}>
                  <View style={[styles.planIconWrap, { backgroundColor: meta.color + "20" }]}>
                    <Feather name={meta.icon} size={18} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.planName, { color: colors.foreground }]}>{sub.plan?.name ?? "Plan"}</Text>
                    <Text style={[styles.planStatLbl, { color: colors.mutedForeground }]}>
                      ${amt.toFixed(2)} invested
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.subProfit, { color: profit >= 0 ? colors.success : colors.destructive }]}>
                      {profit >= 0 ? "+" : ""}${Math.abs(profit).toFixed(4)}
                    </Text>
                    <Text style={[styles.planStatLbl, { color: profit >= 0 ? colors.success : colors.destructive }]}>
                      {profit >= 0 ? "+" : ""}{roi.toFixed(2)}% ROI
                    </Text>
                  </View>
                </View>
                <View style={styles.subMeta}>
                  <View style={[styles.statusBadge, { backgroundColor: sub.status === "active" ? "#22c55e20" : colors.muted }]}>
                    <View style={[styles.statusDot, { backgroundColor: sub.status === "active" ? colors.success : colors.mutedForeground }]} />
                    <Text style={[styles.statusText, { color: sub.status === "active" ? colors.success : colors.mutedForeground }]}>
                      {sub.status}
                    </Text>
                  </View>
                  <Text style={[styles.planStatLbl, { color: colors.mutedForeground }]}>
                    {new Date(sub.createdAt).toLocaleDateString("en-IN")}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.invoiceBtn, { borderColor: meta.color + "50", backgroundColor: meta.color + "10" }]}
                  onPress={() => router.push(`/ai-invoice/${sub.id}` as any)}
                >
                  <Feather name="file-text" size={12} color={meta.color} />
                  <Text style={[styles.invoiceBtnText, { color: meta.color }]}>View P&L Statement</Text>
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}

      {/* AI Chat tab */}
      {tab === "chat" && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <FlatList
            ref={flatRef}
            data={chatMsgs}
            keyExtractor={(m) => m.ts.toString()}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 8 }}
            ListHeaderComponent={
              <View style={[styles.chatHeader, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.aiAvatar, { backgroundColor: "#9945ff20" }]}>
                  <Feather name="cpu" size={20} color="#9945ff" />
                </View>
                <View>
                  <Text style={[styles.aiName, { color: colors.foreground }]}>Zebvix AI Advisor</Text>
                  <View style={styles.onlineRow}>
                    <View style={[styles.onlineDot, { backgroundColor: colors.success }]} />
                    <Text style={[styles.onlineText, { color: colors.success }]}>Online · Powered by GPT-4</Text>
                  </View>
                </View>
              </View>
            }
            renderItem={({ item: msg }) => (
              <View style={[styles.msgRow, msg.role === "user" && styles.msgRowUser]}>
                {msg.role === "assistant" && (
                  <View style={[styles.msgAvatar, { backgroundColor: "#9945ff20" }]}>
                    <Feather name="cpu" size={13} color="#9945ff" />
                  </View>
                )}
                <View style={[
                  styles.msgBubble,
                  msg.role === "user"
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
                ]}>
                  <Text style={[styles.msgText, { color: msg.role === "user" ? "#fff" : colors.foreground }]}>
                    {msg.content}
                  </Text>
                </View>
              </View>
            )}
            ListFooterComponent={
              chatLoading
                ? <View style={styles.msgRow}>
                    <View style={[styles.msgAvatar, { backgroundColor: "#9945ff20" }]}>
                      <Feather name="cpu" size={13} color="#9945ff" />
                    </View>
                    <View style={[styles.msgBubble, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
                      <ActivityIndicator size="small" color={colors.mutedForeground} />
                    </View>
                  </View>
                : null
            }
          />

          {/* Quick prompts */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 8 }}>
            {QUICK_PROMPTS.map((q) => (
              <TouchableOpacity key={q} onPress={() => sendChat(q)} style={[styles.quickPrompt, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.quickPromptText, { color: colors.foreground }]}>{q}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Input bar */}
          <View style={[styles.chatInputWrap, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: botPt + 8 }]}>
            <TextInput
              style={[styles.chatInput, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="Ask about AI plans, strategies..."
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="send"
              onSubmitEditing={() => sendChat()}
              multiline
            />
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: chatInput.trim() ? colors.primary : colors.muted }]}
              onPress={() => sendChat()}
              disabled={!chatInput.trim() || chatLoading}
            >
              <Feather name="send" size={18} color={chatInput.trim() ? "#fff" : colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Subscribe modal */}
      <Modal visible={!!modal} transparent animationType="slide" onRequestClose={() => setModal(null)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setModal(null)}>
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Invest in {modal?.name}</Text>
              <TouchableOpacity onPress={() => setModal(null)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            {modal && (
              <View style={{ padding: 20, gap: 14 }}>
                <View style={[styles.infoRow, { backgroundColor: colors.muted }]}>
                  <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Expected ROI</Text>
                  <Text style={[styles.infoVal, { color: colors.success }]}>
                    +{parseFloat(modal.roi || modal.profitPercentage || "0").toFixed(1)}% in {modal.duration} days
                  </Text>
                </View>
                <View style={[styles.amtWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.amtInput, { color: colors.foreground }]}
                    value={investAmt}
                    onChangeText={setInvestAmt}
                    placeholder="Enter investment amount"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    autoFocus
                  />
                  <Text style={[styles.amtUnit, { color: colors.primary }]}>{modal.currency}</Text>
                </View>
                <Text style={[styles.modalHint, { color: colors.mutedForeground }]}>
                  Min: {parseFloat(modal.minInvestment).toFixed(2)} · Max: {parseFloat(modal.maxInvestment).toFixed(2)} {modal.currency}
                </Text>
                {subscribeMutation.isError && (
                  <Text style={{ color: colors.destructive, fontSize: 12 }}>{(subscribeMutation.error as Error).message}</Text>
                )}
                <TouchableOpacity
                  style={[styles.investBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    if (!investAmt || parseFloat(investAmt) <= 0) return;
                    subscribeMutation.mutate({ planId: modal.id, amount: parseFloat(investAmt) });
                  }}
                  disabled={subscribeMutation.isPending}
                >
                  {subscribeMutation.isPending
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.investBtnLabel}>Confirm Investment</Text>}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "700", textAlign: "center" },
  hero: { flexDirection: "row", alignItems: "center", margin: 16, padding: 18, borderRadius: 16, gap: 16 },
  heroTitle: { color: "#f8fafc", fontSize: 16, fontWeight: "800" },
  heroSub: { color: "#6b7a9e", fontSize: 12, marginTop: 4, lineHeight: 16 },
  statsRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  statChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.07)" },
  statChipText: { fontSize: 11, fontWeight: "700" },
  heroIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  tabRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 11, gap: 5, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabLabel: { fontSize: 13, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  planCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  planTop: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  planIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  planName: { fontSize: 15, fontWeight: "700" },
  riskBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, alignSelf: "flex-start", marginTop: 3 },
  riskBadgeText: { fontSize: 11, fontWeight: "700" },
  planRoiWrap: { alignItems: "center" },
  planRoiVal: { fontSize: 20, fontWeight: "900" },
  planRoiLbl: { fontSize: 11, marginTop: 1 },
  planDesc: { paddingHorizontal: 14, fontSize: 13, lineHeight: 18, marginBottom: 6 },
  planStats: { flexDirection: "row", gap: 8, paddingHorizontal: 14, marginBottom: 12 },
  planStat: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 8 },
  planStatVal: { fontSize: 13, fontWeight: "700" },
  planStatLbl: { fontSize: 10, marginTop: 2 },
  investBtn: { margin: 14, marginTop: 0, height: 44, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  investBtnLabel: { color: "#fff", fontSize: 14, fontWeight: "800" },
  subCard: { borderRadius: 12, borderWidth: 1, padding: 14, overflow: "hidden" },
  subTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  subProfit: { fontSize: 15, fontWeight: "800" },
  subMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  invoiceBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 36, borderRadius: 8, borderWidth: 1, marginTop: 10 },
  invoiceBtnText: { fontSize: 12, fontWeight: "700" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  chatHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  aiAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  aiName: { fontSize: 14, fontWeight: "700" },
  onlineRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  onlineDot: { width: 7, height: 7, borderRadius: 4 },
  onlineText: { fontSize: 11, fontWeight: "600" },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  msgRowUser: { flexDirection: "row-reverse" },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  msgBubble: { maxWidth: "80%", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  msgText: { fontSize: 14, lineHeight: 20 },
  quickPrompt: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  quickPromptText: { fontSize: 12 },
  chatInputWrap: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 12, paddingTop: 8, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  chatInput: { flex: 1, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 16, fontWeight: "700" },
  infoRow: { flexDirection: "row", justifyContent: "space-between", padding: 12, borderRadius: 8 },
  infoLabel: { fontSize: 14 },
  infoVal: { fontSize: 14, fontWeight: "700" },
  amtWrap: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, height: 48, gap: 8 },
  amtInput: { flex: 1, fontSize: 18, fontWeight: "700" },
  amtUnit: { fontSize: 14, fontWeight: "700" },
  modalHint: { fontSize: 12, textAlign: "center" },
});
