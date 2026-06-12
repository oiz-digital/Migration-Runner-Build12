import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import * as ImagePicker from "expo-image-picker";
import { EmptyState } from "@/components/EmptyState";

interface KycRecord {
  id: number;
  level: number;
  status: string;
  createdAt: string;
  notes?: string;
}

interface BankAccount {
  id: number;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  accountHolder: string;
  verified: boolean;
}

const LEVELS = [
  {
    level: 1,
    title: "Level 1 — PAN Verification",
    shortTitle: "PAN KYC",
    description: "Verify PAN to unlock ₹50K/day trading limits",
    icon: "user" as const,
    color: "#3b82f6",
    limits: "₹50,000/day trading · ₹10,000/day withdrawal",
    docs: ["PAN Card Number", "Date of Birth", "Full legal name"],
  },
  {
    level: 2,
    title: "Level 2 — Aadhaar + Selfie",
    shortTitle: "Full KYC",
    description: "Aadhaar + live selfie for ₹5L/day limits & P2P access",
    icon: "shield" as const,
    color: "#8b5cf6",
    limits: "₹5,00,000/day trading · ₹1,00,000/day withdrawal",
    docs: ["Aadhaar Card", "Live selfie photo", "Address proof"],
  },
  {
    level: 3,
    title: "Level 3 — EDD (Enhanced)",
    shortTitle: "EDD",
    description: "For institutional or high-volume traders — unlimited limits",
    icon: "award" as const,
    color: "#eb9100",
    limits: "Unlimited trading · ₹10,00,000/day withdrawal",
    docs: ["Bank statement (3 months)", "Source of funds declaration", "Video KYC call"],
  },
];

type FormStep = "pan" | "aadhaar" | "selfie" | "bank" | null;

export default function KYCScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { user, isAuthenticated } = useAuth();

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const currentLevel = user?.kycLevel ?? 0;

  const [formStep, setFormStep] = useState<FormStep>(null);
  const [panNo, setPanNo] = useState("");
  const [dob, setDob] = useState("");
  const [aadhaarNo, setAadhaarNo] = useState("");
  const [aadhaarDocUri, setAadhaarDocUri] = useState<string | null>(null);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [docUploading, setDocUploading] = useState(false);
  const [bankModal, setBankModal] = useState(false);
  const [bankName, setBankName] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [accountHolder, setAccountHolder] = useState("");

  const { data: kycRecord } = useQuery({
    queryKey: ["kyc-status"],
    queryFn: () => apiFetch<KycRecord>("/api/user/kyc/status"),
    enabled: isAuthenticated,
  });

  const { data: banks } = useQuery<BankAccount[]>({
    queryKey: ["bank-accounts"],
    queryFn: () => apiFetch<BankAccount[]>("/api/finance/bank-account"),
    enabled: isAuthenticated,
  });

  const applyMutation = useMutation({
    mutationFn: (body: object) => apiPost("/api/user/kyc/application", body),
    onSuccess: () => {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setFormStep(null);
      void qc.invalidateQueries({ queryKey: ["kyc-status"] });
    },
  });

  const addBankMutation = useMutation({
    mutationFn: (body: object) => apiPost("/api/finance/bank-account", body),
    onSuccess: () => {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setBankModal(false);
      setBankName(""); setAccountNo(""); setIfsc(""); setAccountHolder("");
      void qc.invalidateQueries({ queryKey: ["bank-accounts"] });
    },
  });

  const pickAadhaarDoc = async () => {
    if (Platform.OS === "web") return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Please allow access to your photo library to upload documents.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) {
      setAadhaarDocUri(result.assets[0].uri);
    }
  };

  const takeSelfie = async () => {
    if (Platform.OS === "web") return;
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Camera Permission Required", "Please allow camera access to take a selfie for KYC verification.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      cameraType: ImagePicker.CameraType.front,
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) {
      setSelfieUri(result.assets[0].uri);
    }
  };

  const uploadDocumentAndApply = async () => {
    setDocUploading(true);
    try {
      // Upload aadhaar doc if selected
      let docUrl: string | undefined;
      if (aadhaarDocUri) {
        const formData = new FormData();
        const filename = aadhaarDocUri.split("/").pop() || "aadhaar.jpg";
        formData.append("document", { uri: aadhaarDocUri, name: filename, type: "image/jpeg" } as any);
        formData.append("type", "aadhaar");
        const uploadRes = await fetch("/api/user/kyc/upload/kyc-document", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json() as { url: string };
          docUrl = uploadData.url;
        }
      }
      // Upload selfie if selected (level 3)
      let selfieUrl: string | undefined;
      if (selfieUri) {
        const formData = new FormData();
        const filename = selfieUri.split("/").pop() || "selfie.jpg";
        formData.append("document", { uri: selfieUri, name: filename, type: "image/jpeg" } as any);
        formData.append("type", "selfie");
        const uploadRes = await fetch("/api/user/kyc/upload/kyc-document", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json() as { url: string };
          selfieUrl = uploadData.url;
        }
      }
      if (formStep === "aadhaar") {
        applyMutation.mutate({ level: 2, aadhaarNumber: aadhaarNo, ...(docUrl ? { aadhaarDocUrl: docUrl } : {}) });
      } else if (formStep === "selfie") {
        applyMutation.mutate({ level: 3, ...(selfieUrl ? { selfieUrl } : {}) });
      }
    } finally {
      setDocUploading(false);
    }
  };

  const handleApply = () => {
    if (formStep === "pan") {
      applyMutation.mutate({ level: 1, panNumber: panNo, dob });
    } else if (formStep === "aadhaar" || formStep === "selfie") {
      void uploadDocumentAndApply();
    }
  };

  const pendingStatus = kycRecord?.status === "pending";
  const rejectedStatus = kycRecord?.status === "rejected";
  const statusColor = pendingStatus ? "#f59e0b" : rejectedStatus ? "#ef4444" : colors.success;
  const statusIcon = pendingStatus ? "clock" : rejectedStatus ? "x-circle" : "check-circle";

  if (!isAuthenticated) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>KYC Verification</Text>
          <View style={styles.backBtn} />
        </View>
        <EmptyState icon="lock" title="Login required" subtitle="Sign in to complete KYC" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>KYC Verification</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: botPt + 24 }}>
        {/* Hero status gradient */}
        <LinearGradient
          colors={currentLevel >= 2 ? ["#0b2a1a", "#0d1524"] : currentLevel >= 1 ? ["#0d1a2a", "#0d1524"] : ["#1a0d0d", "#0d1524"]}
          style={styles.hero}
        >
          <View style={[styles.heroIconWrap, { backgroundColor: (currentLevel > 0 ? colors.success : "#f59e0b") + "25" }]}>
            <Feather name={currentLevel > 0 ? "shield" : "alert-triangle"} size={32} color={currentLevel > 0 ? colors.success : "#f59e0b"} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>
              {currentLevel === 0 ? "Unverified Account" : `Level ${currentLevel} Verified`}
            </Text>
            <Text style={styles.heroSub}>
              {currentLevel === 0
                ? "Complete KYC to unlock full trading features"
                : `Your account is KYC verified at Level ${currentLevel}`}
            </Text>
            {kycRecord && (
              <View style={[styles.statusPill, { backgroundColor: statusColor + "20" }]}>
                <Feather name={statusIcon as any} size={11} color={statusColor} />
                <Text style={[styles.statusPillText, { color: statusColor }]}>
                  {pendingStatus ? "Application under review" : rejectedStatus ? "Application rejected" : `Level ${kycRecord.level} Approved`}
                </Text>
              </View>
            )}
          </View>
        </LinearGradient>

        {/* Progress bar */}
        <View style={[styles.progressWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>Verification Progress</Text>
          <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
            <View style={[styles.progressFill, { width: `${(currentLevel / 3) * 100}%` as any, backgroundColor: colors.success }]} />
          </View>
          <View style={styles.progressSteps}>
            {[1, 2, 3].map((l) => (
              <View key={l} style={styles.progressStep}>
                <View style={[styles.progressDot, {
                  backgroundColor: currentLevel >= l ? colors.success : currentLevel === l - 1 ? colors.primary : colors.muted,
                  borderColor: currentLevel >= l ? colors.success : currentLevel === l - 1 ? colors.primary : colors.border,
                }]}>
                  {currentLevel >= l
                    ? <Feather name="check" size={10} color="#fff" />
                    : <Text style={styles.progressDotNum}>{l}</Text>}
                </View>
                <Text style={[styles.progressStepLabel, { color: currentLevel >= l ? colors.success : colors.mutedForeground }]}>
                  {["PAN", "Aadhaar", "EDD"][l - 1]}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* FIU-IND notice */}
        <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border, margin: 16, marginTop: 0 }]}>
          <Feather name="info" size={13} color={colors.mutedForeground} />
          <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
            Zebvix is registered with FIU-IND under PMLA 2002. KYC mandatory per RBI/SEBI guidelines. Data encrypted & stored securely.
          </Text>
        </View>

        {/* KYC Level Cards */}
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          {LEVELS.map((lvl) => {
            const done = currentLevel >= lvl.level;
            const isNext = currentLevel === lvl.level - 1;
            const inReview = pendingStatus && kycRecord?.level === lvl.level;
            return (
              <View key={lvl.level} style={[styles.levelCard, {
                backgroundColor: colors.card,
                borderColor: done ? colors.success : inReview ? "#f59e0b" : isNext ? lvl.color : colors.border,
                borderWidth: done || isNext || inReview ? 1.5 : 1,
              }]}>
                <LinearGradient
                  colors={[lvl.color + "08", "transparent"]}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.levelHeader}>
                  <View style={[styles.levelIconWrap, { backgroundColor: done ? colors.success + "20" : lvl.color + "20" }]}>
                    <Feather name={done ? "check" : lvl.icon} size={22} color={done ? colors.success : lvl.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.levelTitle, { color: colors.foreground }]}>{lvl.title}</Text>
                    <Text style={[styles.levelDesc, { color: colors.mutedForeground }]}>{lvl.description}</Text>
                  </View>
                  {done && (
                    <View style={[styles.doneBadge, { backgroundColor: colors.success + "20" }]}>
                      <Feather name="check-circle" size={12} color={colors.success} />
                      <Text style={[styles.doneBadgeText, { color: colors.success }]}>Done</Text>
                    </View>
                  )}
                  {inReview && (
                    <View style={[styles.doneBadge, { backgroundColor: "#f59e0b20" }]}>
                      <Feather name="clock" size={12} color="#f59e0b" />
                      <Text style={[styles.doneBadgeText, { color: "#f59e0b" }]}>Review</Text>
                    </View>
                  )}
                </View>

                <View style={[styles.levelSep, { backgroundColor: colors.border }]} />

                <View style={styles.levelBody}>
                  <Text style={[styles.limitsLabel, { color: colors.mutedForeground }]}>{lvl.limits}</Text>
                  <View style={styles.docList}>
                    {lvl.docs.map((d) => (
                      <View key={d} style={styles.docRow}>
                        <Feather name={done ? "check-circle" : "circle"} size={12} color={done ? colors.success : colors.mutedForeground} />
                        <Text style={[styles.docText, { color: done ? colors.success : colors.mutedForeground }]}>{d}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {isNext && !inReview && (
                  <TouchableOpacity
                    style={[styles.startBtn, { backgroundColor: lvl.color }]}
                    onPress={() => {
                      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      if (lvl.level === 1) setFormStep("pan");
                      else if (lvl.level === 2) setFormStep("aadhaar");
                      else setFormStep("selfie");
                    }}
                  >
                    <Feather name="arrow-right" size={15} color="#fff" />
                    <Text style={styles.startBtnText}>Start Level {lvl.level} Verification</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>

        {/* Bank Accounts Section */}
        <View style={{ marginHorizontal: 16, marginTop: 20 }}>
          <View style={styles.sectionHeader}>
            <Feather name="credit-card" size={16} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Bank Accounts</Text>
            <TouchableOpacity onPress={() => setBankModal(true)} style={[styles.addBankBtn, { backgroundColor: colors.primary + "20" }]}>
              <Feather name="plus" size={14} color={colors.primary} />
              <Text style={[styles.addBankText, { color: colors.primary }]}>Add Bank</Text>
            </TouchableOpacity>
          </View>

          {(banks ?? []).length === 0 ? (
            <View style={[styles.bankEmpty, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="credit-card" size={24} color={colors.mutedForeground} />
              <Text style={[styles.bankEmptyText, { color: colors.mutedForeground }]}>No bank accounts added</Text>
              <Text style={[styles.bankEmptyHint, { color: colors.mutedForeground }]}>Add a bank account for INR withdrawals</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {(banks ?? []).map((b) => (
                <View key={b.id} style={[styles.bankCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[styles.bankIcon, { backgroundColor: colors.primary + "20" }]}>
                    <Feather name="credit-card" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.bankName, { color: colors.foreground }]}>{b.bankName}</Text>
                    <Text style={[styles.bankAcc, { color: colors.mutedForeground }]}>
                      ••••{b.accountNumber.slice(-4)} · IFSC: {b.ifsc}
                    </Text>
                    <Text style={[styles.bankHolder, { color: colors.mutedForeground }]}>{b.accountHolder}</Text>
                  </View>
                  {b.verified
                    ? <View style={[styles.verifiedBadge, { backgroundColor: colors.success + "20" }]}>
                        <Feather name="check-circle" size={12} color={colors.success} />
                        <Text style={[styles.verifiedText, { color: colors.success }]}>Verified</Text>
                      </View>
                    : <View style={[styles.verifiedBadge, { backgroundColor: "#f59e0b20" }]}>
                        <Feather name="clock" size={12} color="#f59e0b" />
                        <Text style={[styles.verifiedText, { color: "#f59e0b" }]}>Pending</Text>
                      </View>}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* KYC Rejection note */}
        {rejectedStatus && kycRecord?.notes && (
          <View style={[styles.rejectedBox, { margin: 16, backgroundColor: "#ef444415", borderColor: "#ef444440" }]}>
            <Feather name="alert-circle" size={16} color="#ef4444" />
            <View>
              <Text style={{ color: "#ef4444", fontWeight: "700", fontSize: 13 }}>Application Rejected</Text>
              <Text style={{ color: "#ef4444", fontSize: 12, marginTop: 2 }}>{kycRecord.notes}</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* PAN / Aadhaar form modal */}
      <Modal visible={!!formStep} transparent animationType="slide" onRequestClose={() => setFormStep(null)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setFormStep(null)}>
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                {formStep === "pan" ? "PAN Verification" : formStep === "aadhaar" ? "Aadhaar Verification" : "Document Upload"}
              </Text>
              <TouchableOpacity onPress={() => setFormStep(null)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 20, gap: 14 }}>
              {formStep === "pan" && (
                <>
                  <View style={[styles.inputWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                    <Feather name="credit-card" size={16} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.input, { color: colors.foreground }]}
                      placeholder="PAN Number (e.g. ABCDE1234F)"
                      placeholderTextColor={colors.mutedForeground}
                      value={panNo}
                      onChangeText={(v) => setPanNo(v.toUpperCase())}
                      autoCapitalize="characters"
                      maxLength={10}
                    />
                  </View>
                  <View style={[styles.inputWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                    <Feather name="calendar" size={16} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.input, { color: colors.foreground }]}
                      placeholder="Date of Birth (DD/MM/YYYY)"
                      placeholderTextColor={colors.mutedForeground}
                      value={dob}
                      onChangeText={setDob}
                      keyboardType="numbers-and-punctuation"
                      maxLength={10}
                    />
                  </View>
                </>
              )}
              {formStep === "aadhaar" && (
                <>
                  <View style={[styles.inputWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                    <Feather name="shield" size={16} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.input, { color: colors.foreground }]}
                      placeholder="Aadhaar Number (12 digits)"
                      placeholderTextColor={colors.mutedForeground}
                      value={aadhaarNo}
                      onChangeText={setAadhaarNo}
                      keyboardType="number-pad"
                      maxLength={12}
                    />
                  </View>
                  <TouchableOpacity
                    style={[styles.inputWrap, { backgroundColor: aadhaarDocUri ? colors.primary + "18" : colors.muted, borderColor: aadhaarDocUri ? colors.primary : colors.border, justifyContent: "center", gap: 10 }]}
                    onPress={() => void pickAadhaarDoc()}
                  >
                    <Feather name={aadhaarDocUri ? "check-circle" : "upload"} size={16} color={aadhaarDocUri ? colors.primary : colors.mutedForeground} />
                    <Text style={{ color: aadhaarDocUri ? colors.primary : colors.mutedForeground, fontSize: 14, fontWeight: "600" }}>
                      {aadhaarDocUri ? "Aadhaar photo selected ✓" : "Upload Aadhaar photo (optional)"}
                    </Text>
                  </TouchableOpacity>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, textAlign: "center" }}>
                    Upload a clear photo of your Aadhaar card for faster verification
                  </Text>
                </>
              )}
              {formStep === "selfie" && (
                <View style={{ alignItems: "center", gap: 14, paddingVertical: 10 }}>
                  <TouchableOpacity
                    style={[styles.uploadCircle, {
                      backgroundColor: selfieUri ? colors.primary + "18" : colors.muted,
                      borderColor: selfieUri ? colors.primary : colors.border,
                    }]}
                    onPress={() => void takeSelfie()}
                  >
                    <Feather name={selfieUri ? "check-circle" : "camera"} size={32} color={selfieUri ? colors.primary : colors.mutedForeground} />
                  </TouchableOpacity>
                  <Text style={{ color: colors.foreground, textAlign: "center", fontSize: 14, fontWeight: "700" }}>
                    {selfieUri ? "Selfie captured!" : "Take a live selfie"}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, textAlign: "center", fontSize: 12, lineHeight: 18 }}>
                    Look directly at the camera in good lighting. No sunglasses or headwear.
                  </Text>
                  <TouchableOpacity
                    style={[{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 }, { backgroundColor: colors.primary }]}
                    onPress={() => void takeSelfie()}
                  >
                    <Feather name="camera" size={15} color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                      {selfieUri ? "Retake Selfie" : "Open Camera"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {applyMutation.isError && (
                <Text style={{ color: colors.destructive, fontSize: 12 }}>
                  {(applyMutation.error as Error).message}
                </Text>
              )}

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.primary }]}
                onPress={handleApply}
                disabled={applyMutation.isPending || docUploading}
              >
                {(applyMutation.isPending || docUploading)
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Feather name="send" size={15} color="#fff" />
                      <Text style={styles.submitBtnText}>Submit Application</Text>
                    </>}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add Bank Account modal */}
      <Modal visible={bankModal} transparent animationType="slide" onRequestClose={() => setBankModal(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setBankModal(false)}>
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Add Bank Account</Text>
              <TouchableOpacity onPress={() => setBankModal(false)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 20, gap: 12 }}>
              {[
                { label: "Bank Name", value: bankName, onChange: setBankName, placeholder: "e.g. State Bank of India", icon: "home" as const },
                { label: "Account Holder", value: accountHolder, onChange: setAccountHolder, placeholder: "Full name as per bank", icon: "user" as const },
                { label: "Account Number", value: accountNo, onChange: setAccountNo, placeholder: "Account number", icon: "hash" as const, keyboardType: "number-pad" as const },
                { label: "IFSC Code", value: ifsc, onChange: setIfsc, placeholder: "e.g. SBIN0001234", icon: "code" as const, autoCapitalize: "characters" as const },
              ].map((f) => (
                <View key={f.label}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{f.label}</Text>
                  <View style={[styles.inputWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                    <Feather name={f.icon} size={15} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.input, { color: colors.foreground }]}
                      placeholder={f.placeholder}
                      placeholderTextColor={colors.mutedForeground}
                      value={f.value}
                      onChangeText={f.onChange}
                      keyboardType={f.keyboardType}
                      autoCapitalize={f.autoCapitalize}
                    />
                  </View>
                </View>
              ))}

              {addBankMutation.isError && (
                <Text style={{ color: colors.destructive, fontSize: 12 }}>
                  {(addBankMutation.error as Error).message}
                </Text>
              )}

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.primary }]}
                onPress={() => addBankMutation.mutate({ bankName, accountNumber: accountNo, ifsc, accountHolder })}
                disabled={addBankMutation.isPending || !bankName || !accountNo || !ifsc || !accountHolder}
              >
                {addBankMutation.isPending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Feather name="plus" size={15} color="#fff" />
                      <Text style={styles.submitBtnText}>Add Bank Account</Text>
                    </>}
              </TouchableOpacity>
            </View>
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
  hero: { flexDirection: "row", alignItems: "center", padding: 20, gap: 16, margin: 16, borderRadius: 16 },
  heroIconWrap: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontSize: 17, fontWeight: "800", color: "#f8fafc" },
  heroSub: { fontSize: 12, color: "#6b7a9e", marginTop: 4, lineHeight: 16 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: "flex-start" },
  statusPillText: { fontSize: 11, fontWeight: "700" },
  progressWrap: { marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 14, borderWidth: 1 },
  progressLabel: { fontSize: 12, marginBottom: 10 },
  progressTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  progressSteps: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
  progressStep: { alignItems: "center", gap: 4 },
  progressDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  progressDotNum: { color: "#fff", fontSize: 11, fontWeight: "700" },
  progressStepLabel: { fontSize: 11, fontWeight: "600" },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  noticeText: { flex: 1, fontSize: 11, lineHeight: 16 },
  levelCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  levelHeader: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  levelIconWrap: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  levelTitle: { fontSize: 14, fontWeight: "700" },
  levelDesc: { fontSize: 12, marginTop: 2 },
  doneBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  doneBadgeText: { fontSize: 11, fontWeight: "700" },
  levelSep: { height: StyleSheet.hairlineWidth },
  levelBody: { padding: 14 },
  limitsLabel: { fontSize: 12, marginBottom: 8 },
  docList: { gap: 6 },
  docRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  docText: { fontSize: 13 },
  startBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", margin: 14, marginTop: 0, height: 44, borderRadius: 10, gap: 8 },
  startBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  sectionTitle: { flex: 1, fontSize: 16, fontWeight: "700" },
  addBankBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  addBankText: { fontSize: 13, fontWeight: "700" },
  bankEmpty: { alignItems: "center", padding: 30, borderRadius: 14, borderWidth: 1, gap: 8 },
  bankEmptyText: { fontSize: 14, fontWeight: "600" },
  bankEmptyHint: { fontSize: 12 },
  bankCard: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 12, borderWidth: 1, gap: 12 },
  bankIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  bankName: { fontSize: 14, fontWeight: "700" },
  bankAcc: { fontSize: 12, marginTop: 2 },
  bankHolder: { fontSize: 11, marginTop: 1 },
  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  verifiedText: { fontSize: 11, fontWeight: "700" },
  rejectedBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 16, fontWeight: "700" },
  inputWrap: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, height: 48, gap: 10 },
  input: { flex: 1, fontSize: 15 },
  fieldLabel: { fontSize: 12, marginBottom: 6 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", height: 48, borderRadius: 12, gap: 8 },
  submitBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  uploadCircle: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center", borderWidth: 2, borderStyle: "dashed" },
});
