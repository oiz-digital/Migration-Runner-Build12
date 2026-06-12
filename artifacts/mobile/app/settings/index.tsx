import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme, type AppTheme } from "@/contexts/ThemeContext";
import { apiFetch, apiPost, apiPut } from "@/hooks/useApi";

interface UserSettings {
  emailNotifications?: boolean;
  pushNotifications?: boolean;
  priceAlerts?: boolean;
  tradeConfirmations?: boolean;
  currency?: string;
  language?: string;
  twoFaEnabled?: boolean;
}

function SectionHeader({ title, colors }: { title: string; colors: any }) {
  return (
    <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>
      {title.toUpperCase()}
    </Text>
  );
}

function RowDivider({ colors }: { colors: any }) {
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

function SettingToggle({
  icon, label, sublabel, value, onToggle, iconColor, colors,
}: {
  icon: keyof typeof Feather.glyphMap; label: string; sublabel?: string;
  value: boolean; onToggle: (v: boolean) => void; iconColor?: string; colors: any;
}) {
  const c = iconColor ?? colors.primary;
  return (
    <View style={styles.settingRow}>
      <View style={[styles.iconBox, { backgroundColor: c + "20" }]}>
        <Feather name={icon} size={17} color={c} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
        {sublabel && <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{sublabel}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.muted, true: colors.primary + "80" }}
        thumbColor={value ? colors.primary : "#6b7a9e"}
      />
    </View>
  );
}

function SettingNav({
  icon, label, sublabel, value, onPress, iconColor, danger, colors,
}: {
  icon: keyof typeof Feather.glyphMap; label: string; sublabel?: string;
  value?: string; onPress: () => void; iconColor?: string; danger?: boolean; colors: any;
}) {
  const c = danger ? "#F6465D" : (iconColor ?? colors.primary);
  return (
    <TouchableOpacity style={styles.settingRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.iconBox, { backgroundColor: c + "20" }]}>
        <Feather name={icon} size={17} color={c} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: danger ? "#F6465D" : colors.foreground }]}>{label}</Text>
        {sublabel && <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{sublabel}</Text>}
      </View>
      {value && <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>{value}</Text>}
      {!danger && <Feather name="chevron-right" size={16} color={colors.mutedForeground} />}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const qc = useQueryClient();

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const [notifEmail, setNotifEmail] = useState(true);
  const [notifPush, setNotifPush] = useState(true);
  const [notifPrice, setNotifPrice] = useState(true);
  const [notifTrade, setNotifTrade] = useState(true);
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [twoFaStep, setTwoFaStep] = useState<"idle" | "pending" | "verify">("idle");
  const [qrUri, setQrUri] = useState("");
  const [showThemePicker, setShowThemePicker] = useState(false);
  const { theme, setTheme } = useTheme();
  const THEME_LABELS: Record<AppTheme, string> = { dark: "Dark", light: "Light", system: "System" };

  const enable2FAMut = useMutation({
    mutationFn: () => apiPost<{ qrUri: string; secret: string }>("/api/auth/2fa/enable"),
    onSuccess: (d) => { setQrUri(d.qrUri); setTwoFaStep("verify"); },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const verify2FAMut = useMutation({
    mutationFn: () => apiPost("/api/auth/2fa", { token: otpCode }),
    onSuccess: () => {
      setShow2FAModal(false); setTwoFaStep("idle"); setOtpCode("");
      qc.invalidateQueries({ queryKey: ["me"] });
      Alert.alert("Success", "2FA enabled successfully");
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const disable2FAMut = useMutation({
    mutationFn: () => apiPost("/api/auth/2fa/disable", { token: otpCode }),
    onSuccess: () => {
      setShow2FAModal(false); setTwoFaStep("idle"); setOtpCode("");
      qc.invalidateQueries({ queryKey: ["me"] });
      Alert.alert("Success", "2FA disabled");
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const changePasswordMut = useMutation({
    mutationFn: () => apiPost("/api/auth/reset"),
    onSuccess: () => Alert.alert("Email Sent", "Check your inbox for a password reset link"),
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const handle2FAPress = () => {
    if (user?.twoFaEnabled) {
      setTwoFaStep("verify");
      setShow2FAModal(true);
    } else {
      enable2FAMut.mutate();
      setShow2FAModal(true);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient
        colors={["#0d1524", "#080e1a"]}
        style={[styles.header, { paddingTop: topPt + 12 }]}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Settings</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ paddingBottom: botPt + 30 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Quick */}
        <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <LinearGradient
            colors={[colors.primary + "30", colors.primary + "08"]}
            style={styles.avatarGrad}
          >
            <Text style={[styles.avatarChar, { color: colors.primary }]}>
              {user?.name?.charAt(0)?.toUpperCase() ?? "Z"}
            </Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={[styles.profileName, { color: colors.foreground }]}>{user?.name ?? "Trader"}</Text>
            <Text style={[styles.profileEmail, { color: colors.mutedForeground }]}>{user?.email ?? ""}</Text>
          </View>
          <TouchableOpacity style={[styles.editBtn, { borderColor: colors.primary }]}>
            <Feather name="edit-2" size={14} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Security */}
        <View style={styles.section}>
          <SectionHeader title="Security" colors={colors} />
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SettingNav
              icon="lock"
              label="Two-Factor Authentication"
              sublabel={user?.twoFaEnabled ? "TOTP Authenticator enabled" : "Strongly recommended"}
              value={user?.twoFaEnabled ? "ON" : "OFF"}
              iconColor={user?.twoFaEnabled ? "#0ECB81" : "#f59e0b"}
              onPress={handle2FAPress}
              colors={colors}
            />
            <RowDivider colors={colors} />
            <SettingNav
              icon="key"
              label="Change Password"
              sublabel="Send reset link to your email"
              iconColor="#9945ff"
              onPress={() => {
                Alert.alert("Reset Password", "Send password reset email?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Send", onPress: () => changePasswordMut.mutate() },
                ]);
              }}
              colors={colors}
            />
            <RowDivider colors={colors} />
            <SettingNav
              icon="smartphone"
              label="Active Sessions"
              sublabel="View and revoke login sessions"
              iconColor="#346aa9"
              onPress={() => {}}
              colors={colors}
            />
            <RowDivider colors={colors} />
            <SettingNav
              icon="shield"
              label="Anti-Phishing Code"
              sublabel="Set a secret phrase in all emails"
              iconColor="#627eea"
              onPress={() => {}}
              colors={colors}
            />
          </View>
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <SectionHeader title="Notifications" colors={colors} />
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SettingToggle
              icon="mail"
              label="Email Notifications"
              sublabel="Trades, deposits, security alerts"
              value={notifEmail}
              onToggle={setNotifEmail}
              colors={colors}
            />
            <RowDivider colors={colors} />
            <SettingToggle
              icon="bell"
              label="Push Notifications"
              sublabel="Real-time alerts on your device"
              value={notifPush}
              onToggle={setNotifPush}
              colors={colors}
            />
            <RowDivider colors={colors} />
            <SettingToggle
              icon="trending-up"
              label="Price Alerts"
              sublabel="Notify when target price is hit"
              value={notifPrice}
              onToggle={setNotifPrice}
              iconColor="#0ECB81"
              colors={colors}
            />
            <RowDivider colors={colors} />
            <SettingToggle
              icon="check-circle"
              label="Trade Confirmations"
              sublabel="Confirm before placing orders"
              value={notifTrade}
              onToggle={setNotifTrade}
              iconColor="#f59e0b"
              colors={colors}
            />
          </View>
        </View>

        {/* Preferences */}
        <View style={styles.section}>
          <SectionHeader title="Preferences" colors={colors} />
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SettingNav icon="dollar-sign" label="Currency" value="INR" iconColor="#0ECB81" onPress={() => {}} colors={colors} />
            <RowDivider colors={colors} />
            <SettingNav icon="globe" label="Language" value="English" iconColor="#346aa9" onPress={() => {}} colors={colors} />
            <RowDivider colors={colors} />
            <SettingNav icon="moon" label="Appearance" value={THEME_LABELS[theme]} iconColor="#9945ff" onPress={() => setShowThemePicker(true)} colors={colors} />
            <RowDivider colors={colors} />
            <SettingNav icon="bar-chart-2" label="Default Chart Type" value="Candlestick" iconColor="#eb9100" onPress={() => {}} colors={colors} />
          </View>
        </View>

        {/* Account */}
        <View style={styles.section}>
          <SectionHeader title="Account" colors={colors} />
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SettingNav
              icon="shield"
              label="KYC Verification"
              sublabel="Identity & address verification"
              value={["Unverified", "Level 1", "Level 2", "Level 3"][user?.kycLevel ?? 0]}
              iconColor={["#F6465D", "#f59e0b", "#0ECB81", "#0ECB81"][user?.kycLevel ?? 0]}
              onPress={() => router.push("/kyc" as any)}
              colors={colors}
            />
            <RowDivider colors={colors} />
            <SettingNav icon="users" label="Referral Program" sublabel="Invite friends and earn rewards" iconColor="#627eea" onPress={() => router.push("/invite" as any)} colors={colors} />
            <RowDivider colors={colors} />
            <SettingNav icon="credit-card" label="Payment Methods" sublabel="UPI, bank account, INR" iconColor="#346aa9" onPress={() => router.push("/inr-payments" as any)} colors={colors} />
            <RowDivider colors={colors} />
            <SettingNav icon="file-text" label="API Keys" sublabel="Manage trading API access" iconColor="#9945ff" onPress={() => {}} colors={colors} />
          </View>
        </View>

        {/* Legal */}
        <View style={styles.section}>
          <SectionHeader title="Legal & Support" colors={colors} />
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SettingNav icon="help-circle" label="Help & Support" onPress={() => router.push("/support" as any)} colors={colors} />
            <RowDivider colors={colors} />
            <SettingNav icon="file-text" label="Terms of Service" onPress={() => router.push("/legal/terms" as any)} colors={colors} />
            <RowDivider colors={colors} />
            <SettingNav icon="eye" label="Privacy Policy" onPress={() => router.push("/legal/privacy" as any)} colors={colors} />
            <RowDivider colors={colors} />
            <SettingNav icon="alert-triangle" label="Risk Disclosure" onPress={() => router.push("/legal/risk" as any)} iconColor="#f59e0b" colors={colors} />
            <RowDivider colors={colors} />
            <SettingNav icon="tag" label="Fee Schedule" onPress={() => router.push("/legal/fees" as any)} iconColor="#0ECB81" colors={colors} />
          </View>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SettingNav
              icon="log-out"
              label="Sign Out"
              danger
              onPress={() => {
                Alert.alert("Sign Out", "Are you sure you want to sign out?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Sign Out", style: "destructive", onPress: () => void logout() },
                ]);
              }}
              colors={colors}
            />
          </View>
        </View>

        <Text style={[styles.version, { color: colors.mutedForeground }]}>
          Zebvix v1.0.0 · FIU-IND Compliant · PMLA 2002
        </Text>
      </ScrollView>

      {/* Theme Picker Modal */}
      {showThemePicker && (
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Appearance</Text>
            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>Choose your preferred display mode</Text>
            {(["dark", "light", "system"] as AppTheme[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  styles.themeOption,
                  { borderColor: theme === t ? colors.primary : colors.border, backgroundColor: theme === t ? colors.primary + "15" : colors.muted },
                ]}
                onPress={() => { setTheme(t); setShowThemePicker(false); }}
              >
                <Feather
                  name={t === "dark" ? "moon" : t === "light" ? "sun" : "monitor"}
                  size={18}
                  color={theme === t ? colors.primary : colors.mutedForeground}
                />
                <Text style={[styles.themeOptionLabel, { color: theme === t ? colors.primary : colors.foreground }]}>
                  {THEME_LABELS[t]}
                </Text>
                {theme === t && <Feather name="check" size={16} color={colors.primary} style={{ marginLeft: "auto" }} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: colors.muted, marginTop: 8 }]}
              onPress={() => setShowThemePicker(false)}
            >
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 2FA Modal */}
      {show2FAModal && (
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {user?.twoFaEnabled ? "Disable 2FA" : "Enable 2FA"}
            </Text>
            {twoFaStep === "pending" && (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
            )}
            {twoFaStep === "verify" && (
              <>
                <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
                  {user?.twoFaEnabled
                    ? "Enter your authenticator code to disable 2FA"
                    : "Scan the QR code in Google Authenticator, then enter the 6-digit code"}
                </Text>
                <TextInput
                  style={[styles.codeInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                  placeholder="000000"
                  placeholderTextColor={colors.mutedForeground}
                  value={otpCode}
                  onChangeText={setOtpCode}
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <View style={styles.modalBtns}>
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: colors.muted }]}
                    onPress={() => { setShow2FAModal(false); setTwoFaStep("idle"); setOtpCode(""); }}
                  >
                    <Text style={{ color: colors.foreground, fontWeight: "600" }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: user?.twoFaEnabled ? "#F6465D" : colors.primary }]}
                    onPress={() => user?.twoFaEnabled ? disable2FAMut.mutate() : verify2FAMut.mutate()}
                    disabled={otpCode.length < 6}
                  >
                    {(verify2FAMut.isPending || disable2FAMut.isPending) ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={{ color: "#fff", fontWeight: "700" }}>Confirm</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700" },
  profileCard: { margin: 16, borderRadius: 16, borderWidth: 1, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  avatarGrad: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  avatarChar: { fontSize: 22, fontWeight: "800" },
  profileName: { fontSize: 16, fontWeight: "700" },
  profileEmail: { fontSize: 13, marginTop: 2 },
  editBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  section: { marginTop: 20, paddingHorizontal: 16 },
  sectionHeader: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, marginBottom: 8 },
  card: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  settingRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  iconBox: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 14, fontWeight: "500" },
  rowSub: { fontSize: 11, marginTop: 1 },
  rowValue: { fontSize: 12, marginRight: 4 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 62 },
  version: { textAlign: "center", fontSize: 11, marginTop: 24, marginBottom: 8 },
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000000cc", justifyContent: "center", alignItems: "center", zIndex: 99 },
  modal: { width: "88%", borderRadius: 18, borderWidth: 1, padding: 24 },
  themeOption: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1.5, marginBottom: 8 },
  themeOptionLabel: { fontSize: 15, fontWeight: "600" },
  modalTitle: { fontSize: 18, fontWeight: "800", textAlign: "center", marginBottom: 12 },
  modalSub: { fontSize: 13, textAlign: "center", marginBottom: 16 },
  codeInput: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 24, fontWeight: "700", textAlign: "center", letterSpacing: 8, marginBottom: 16 },
  modalBtns: { flexDirection: "row", gap: 10 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
