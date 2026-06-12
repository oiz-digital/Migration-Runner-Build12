import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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

interface Ticket {
  id: number;
  subject: string;
  status: "open" | "closed" | "pending";
  priority: "low" | "medium" | "high";
  createdAt: string;
  updatedAt: string;
  messages?: TicketMessage[];
}

interface TicketMessage {
  id: number;
  message: string;
  isStaff: boolean;
  createdAt: string;
}

const CATEGORIES = [
  "Account & KYC",
  "Deposits & Withdrawals",
  "Trading Issues",
  "API Access",
  "Wallet & Balance",
  "Security",
  "Other",
];

const FAQS = [
  { q: "How do I complete KYC?", a: "Go to Profile → KYC Verification. Upload your PAN card for Level 1, and Aadhaar + selfie for Level 2." },
  { q: "When will my deposit reflect?", a: "Crypto deposits reflect after 1-3 network confirmations. INR deposits via UPI reflect within minutes." },
  { q: "How long do withdrawals take?", a: "Crypto withdrawals process within 30 mins. INR withdrawals take 1-2 business days." },
  { q: "My order is stuck, what do I do?", a: "Open spot orders can be cancelled anytime from the Orders screen. Contact support if it persists." },
  { q: "How do I enable 2FA?", a: "Go to Profile → Settings → Two-Factor Authentication. Scan the QR code with Google Authenticator." },
  { q: "What are the trading fees?", a: "Maker fee: 0.1%, Taker fee: 0.15%. VIP tiers offer reduced fees. See the Fee Schedule for details." },
];

const STATUS_META = {
  open: { color: "#0ECB81", label: "Open", icon: "circle" as const },
  pending: { color: "#f59e0b", label: "Pending", icon: "clock" as const },
  closed: { color: "#6b7a9e", label: "Closed", icon: "check-circle" as const },
};

const PRIORITY_META = {
  low: { color: "#6b7a9e", label: "Low" },
  medium: { color: "#f59e0b", label: "Medium" },
  high: { color: "#F6465D", label: "High" },
};

export default function SupportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const qc = useQueryClient();

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const [tab, setTab] = useState<"help" | "tickets">("help");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [message, setMessage] = useState("");
  const [replyText, setReplyText] = useState("");

  const ticketsQ = useQuery<{ tickets: Ticket[] }>({
    queryKey: ["support-tickets"],
    queryFn: () => apiFetch("/api/support/ticket"),
    enabled: isAuthenticated && tab === "tickets",
  });

  const ticketDetailQ = useQuery<{ ticket: Ticket }>({
    queryKey: ["ticket", selectedTicket?.id],
    queryFn: () => apiFetch(`/api/support/ticket/${selectedTicket?.id}`),
    enabled: !!selectedTicket,
  });

  const createMut = useMutation({
    mutationFn: () => apiPost("/api/support/ticket", { subject, category, message }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCreate(false); setSubject(""); setMessage(""); setCategory(CATEGORIES[0]);
      setTab("tickets");
      Alert.alert("Ticket Created", "We'll respond within 24 hours");
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const replyMut = useMutation({
    mutationFn: () => apiPost(`/api/support/ticket/${selectedTicket?.id}/message`, { message: replyText }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket", selectedTicket?.id] });
      setReplyText("");
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const tickets = ticketsQ.data?.tickets ?? [];
  const ticket = ticketDetailQ.data?.ticket ?? selectedTicket;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={["#0d1524", "#080e1a"]}
        style={[styles.header, { paddingTop: topPt + 12 }]}
      >
        <TouchableOpacity style={styles.backBtn} onPress={selectedTicket ? () => setSelectedTicket(null) : () => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {selectedTicket ? `Ticket #${selectedTicket.id}` : "Help & Support"}
        </Text>
        {!selectedTicket && isAuthenticated && (
          <TouchableOpacity
            style={[styles.newBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowCreate(true)}
          >
            <Feather name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        )}
        {selectedTicket && <View style={{ width: 40 }} />}
      </LinearGradient>

      {selectedTicket ? (
        /* Ticket detail */
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
            <View style={[styles.ticketHeader, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.ticketSubject, { color: colors.foreground }]}>{ticket?.subject}</Text>
              <View style={styles.ticketMeta}>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_META[ticket?.status ?? "open"].color + "20" }]}>
                  <Text style={{ color: STATUS_META[ticket?.status ?? "open"].color, fontSize: 11, fontWeight: "700" }}>
                    {STATUS_META[ticket?.status ?? "open"].label}
                  </Text>
                </View>
                <View style={[styles.priorityBadge, { backgroundColor: PRIORITY_META[ticket?.priority ?? "low"].color + "20" }]}>
                  <Text style={{ color: PRIORITY_META[ticket?.priority ?? "low"].color, fontSize: 11, fontWeight: "700" }}>
                    {PRIORITY_META[ticket?.priority ?? "low"].label}
                  </Text>
                </View>
              </View>
            </View>
            {(ticket?.messages ?? []).map((m) => (
              <View
                key={m.id}
                style={[styles.msgBubble, {
                  alignSelf: m.isStaff ? "flex-start" : "flex-end",
                  backgroundColor: m.isStaff ? colors.card : colors.primary + "20",
                  borderColor: m.isStaff ? colors.border : colors.primary + "40",
                }]}
              >
                {m.isStaff && (
                  <Text style={[styles.staffLabel, { color: colors.primary }]}>Zebvix Support</Text>
                )}
                <Text style={[styles.msgText, { color: colors.foreground }]}>{m.message}</Text>
                <Text style={[styles.msgTime, { color: colors.mutedForeground }]}>
                  {new Date(m.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            ))}
          </ScrollView>
          {ticket?.status !== "closed" && (
            <View style={[styles.replyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TextInput
                style={[styles.replyInput, { color: colors.foreground }]}
                placeholder="Type your reply..."
                placeholderTextColor={colors.mutedForeground}
                value={replyText}
                onChangeText={setReplyText}
                multiline
              />
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: colors.primary }]}
                onPress={() => replyMut.mutate()}
                disabled={!replyText.trim() || replyMut.isPending}
              >
                {replyMut.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Feather name="send" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        <>
          {/* Tabs */}
          <View style={styles.tabRow}>
            {(["help", "tickets"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.tabBtn, { borderColor: t === tab ? colors.primary : colors.border, backgroundColor: t === tab ? colors.primary + "15" : colors.card }]}
                onPress={() => setTab(t)}
              >
                <Feather name={t === "help" ? "help-circle" : "message-square"} size={15} color={t === tab ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.tabLabel, { color: t === tab ? colors.primary : colors.mutedForeground }]}>
                  {t === "help" ? "Help Center" : `My Tickets${tickets.length ? ` (${tickets.length})` : ""}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {tab === "help" ? (
            <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: botPt + 30 }} showsVerticalScrollIndicator={false}>
              {/* Quick links */}
              <View style={styles.quickGrid}>
                {[
                  { icon: "book" as const, label: "Guides", color: "#627eea" },
                  { icon: "video" as const, label: "Tutorials", color: "#9945ff" },
                  { icon: "message-circle" as const, label: "Live Chat", color: "#0ECB81" },
                  { icon: "mail" as const, label: "Email Us", color: "#eb9100" },
                ].map((q) => (
                  <TouchableOpacity
                    key={q.label}
                    style={[styles.quickCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <View style={[styles.quickIcon, { backgroundColor: q.color + "20" }]}>
                      <Feather name={q.icon} size={22} color={q.color} />
                    </View>
                    <Text style={[styles.quickLabel, { color: colors.foreground }]}>{q.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* FAQ */}
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>FREQUENTLY ASKED QUESTIONS</Text>
              {FAQS.map((faq, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.faqCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => setOpenFaq(openFaq === i ? null : i)}
                  activeOpacity={0.8}
                >
                  <View style={styles.faqTop}>
                    <Text style={[styles.faqQ, { color: colors.foreground }]}>{faq.q}</Text>
                    <Feather name={openFaq === i ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
                  </View>
                  {openFaq === i && (
                    <Text style={[styles.faqA, { color: colors.mutedForeground }]}>{faq.a}</Text>
                  )}
                </TouchableOpacity>
              ))}

              <View style={[styles.contactCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="mail" size={20} color={colors.primary} />
                <View>
                  <Text style={[styles.contactTitle, { color: colors.foreground }]}>Email Support</Text>
                  <Text style={[styles.contactSub, { color: colors.mutedForeground }]}>support@zebvix.com · Response within 24h</Text>
                </View>
              </View>
            </ScrollView>
          ) : (
            ticketsQ.isLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
            ) : tickets.length === 0 ? (
              <EmptyState icon="message-square" title="No support tickets" subtitle="Create a ticket and we'll help you out" />
            ) : (
              <FlatList
                data={tickets}
                keyExtractor={(t) => String(t.id)}
                contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: botPt + 30 }}
                showsVerticalScrollIndicator={false}
                renderItem={({ item: t }) => {
                  const sm = STATUS_META[t.status];
                  return (
                    <TouchableOpacity
                      style={[styles.ticketCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={() => setSelectedTicket(t)}
                    >
                      <View style={styles.ticketTop}>
                        <Text style={[styles.ticketCardSubject, { color: colors.foreground }]} numberOfLines={1}>{t.subject}</Text>
                        <View style={[styles.statusBadge, { backgroundColor: sm.color + "20" }]}>
                          <Text style={{ color: sm.color, fontSize: 10, fontWeight: "700" }}>{sm.label}</Text>
                        </View>
                      </View>
                      <Text style={[styles.ticketDate, { color: colors.mutedForeground }]}>
                        #{t.id} · Updated {new Date(t.updatedAt).toLocaleDateString("en-IN")}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )
          )}
        </>
      )}

      {/* Create Ticket Modal */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Support Ticket</Text>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>CATEGORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.catChip, { borderColor: c === category ? colors.primary : colors.border, backgroundColor: c === category ? colors.primary + "20" : colors.muted }]}
                    onPress={() => setCategory(c)}
                  >
                    <Text style={{ color: c === category ? colors.primary : colors.mutedForeground, fontWeight: "600", fontSize: 12 }}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>SUBJECT</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
              placeholder="Brief description of your issue"
              placeholderTextColor={colors.mutedForeground}
              value={subject}
              onChangeText={setSubject}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>MESSAGE</Text>
            <TextInput
              style={[styles.textarea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
              placeholder="Describe your issue in detail..."
              placeholderTextColor={colors.mutedForeground}
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={5}
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.muted }]} onPress={() => setShowCreate(false)}>
                <Text style={{ color: colors.foreground, fontWeight: "700" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                onPress={() => createMut.mutate()}
                disabled={!subject || !message || createMut.isPending}
              >
                {createMut.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Submit</Text>}
              </TouchableOpacity>
            </View>
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
  newBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  tabRow: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  tabLabel: { fontSize: 13, fontWeight: "600" },
  sectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quickCard: { width: "47%", borderRadius: 14, borderWidth: 1, padding: 16, alignItems: "center", gap: 8 },
  quickIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  quickLabel: { fontSize: 14, fontWeight: "600" },
  faqCard: { borderRadius: 12, borderWidth: 1, padding: 14 },
  faqTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  faqQ: { flex: 1, fontSize: 14, fontWeight: "600" },
  faqA: { fontSize: 13, marginTop: 10, lineHeight: 20 },
  contactCard: { borderRadius: 12, borderWidth: 1, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  contactTitle: { fontSize: 15, fontWeight: "700" },
  contactSub: { fontSize: 12, marginTop: 2 },
  ticketCard: { borderRadius: 12, borderWidth: 1, padding: 14 },
  ticketTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  ticketCardSubject: { flex: 1, fontSize: 14, fontWeight: "600" },
  ticketDate: { fontSize: 11, marginTop: 6 },
  ticketHeader: { borderRadius: 12, borderWidth: 1, padding: 14 },
  ticketSubject: { fontSize: 16, fontWeight: "700" },
  ticketMeta: { flexDirection: "row", gap: 8, marginTop: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  msgBubble: { maxWidth: "80%", borderRadius: 12, borderWidth: 1, padding: 12 },
  staffLabel: { fontSize: 11, fontWeight: "700", marginBottom: 4 },
  msgText: { fontSize: 14, lineHeight: 20 },
  msgTime: { fontSize: 10, marginTop: 4 },
  replyBox: { flexDirection: "row", alignItems: "flex-end", borderTopWidth: 1, padding: 12, gap: 8 },
  replyInput: { flex: 1, fontSize: 14, maxHeight: 100, minHeight: 40 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  modalOverlay: { flex: 1, backgroundColor: "#000000cc", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 36, height: 4, backgroundColor: "#ffffff30", borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 20 },
  fieldLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 8 },
  catChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  input: { borderWidth: 1, borderRadius: 10, padding: 13, fontSize: 14, marginBottom: 16 },
  textarea: { borderWidth: 1, borderRadius: 10, padding: 13, fontSize: 14, marginBottom: 16, height: 120, textAlignVertical: "top" },
  modalBtns: { flexDirection: "row", gap: 10 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
});
