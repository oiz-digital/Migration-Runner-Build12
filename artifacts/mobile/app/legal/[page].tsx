import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const LEGAL_CONTENT: Record<string, { title: string; icon: string; sections: { heading: string; body: string }[] }> = {
  terms: {
    title: "Terms of Service",
    icon: "file-text",
    sections: [
      { heading: "1. Acceptance of Terms", body: "By accessing or using Zebvix (\"Platform\"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Platform. These terms constitute a legally binding agreement between you and Zebvix Technologies Pvt Ltd." },
      { heading: "2. Eligibility", body: "You must be at least 18 years old and a resident of India to use our services. By using the Platform, you represent that you meet these requirements. Users from certain jurisdictions may be restricted." },
      { heading: "3. Account Registration", body: "You agree to provide accurate, current, and complete information during registration. You are responsible for safeguarding your account credentials and for all activities under your account. Notify us immediately of any unauthorized use." },
      { heading: "4. Trading & Orders", body: "All trades are final once confirmed. You are solely responsible for your trading decisions. Zebvix acts as a platform facilitator and does not provide investment advice. Trading cryptocurrency involves significant risk of loss." },
      { heading: "5. Fees", body: "Maker fee: 0.1%, Taker fee: 0.15%. Withdrawal fees vary by network. Fees may be updated with 7 days notice. VIP tiers provide fee discounts based on 30-day trading volume." },
      { heading: "6. Prohibited Activities", body: "Market manipulation, wash trading, spoofing, layering, and any form of fraudulent activity is strictly prohibited. Violations may result in immediate account suspension and forfeiture of funds." },
      { heading: "7. KYC & AML", body: "You must complete KYC verification to access full platform features. We comply with PMLA 2002 and FIU-IND regulations. We reserve the right to freeze accounts pending AML investigations." },
      { heading: "8. Limitation of Liability", body: "Zebvix is not liable for losses arising from market volatility, technical failures, network congestion, or force majeure events. Our liability is limited to the fees you paid in the 30 days preceding the claim." },
      { heading: "9. Dispute Resolution", body: "Disputes shall be resolved through binding arbitration under the Arbitration and Conciliation Act, 1996. The seat of arbitration shall be Mumbai, India. Indian law governs these terms." },
      { heading: "10. Governing Law", body: "These Terms are governed by the laws of India. Any legal proceedings shall be subject to the exclusive jurisdiction of courts in Mumbai, Maharashtra." },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    icon: "eye",
    sections: [
      { heading: "1. Information We Collect", body: "We collect: (a) Identity data — name, date of birth, PAN, Aadhaar; (b) Contact data — email, phone, address; (c) Financial data — bank accounts, wallet addresses, transaction history; (d) Technical data — IP address, device ID, browser type; (e) Usage data — trading patterns, session logs." },
      { heading: "2. How We Use Your Data", body: "Your data is used to: provide and improve our services; verify your identity (KYC/AML); process transactions; detect fraud; send service communications; comply with legal obligations; conduct analytics (in anonymized form)." },
      { heading: "3. Data Sharing", body: "We share data with: regulatory authorities (FIU-IND, SEBI, RBI) as required; KYC verification partners; banking partners for INR settlement; fraud prevention services; analytics providers (anonymized only). We never sell your personal data." },
      { heading: "4. Data Security", body: "We implement industry-standard security: AES-256 encryption at rest; TLS 1.3 in transit; Hardware Security Modules for key management; 98% cold storage for crypto assets; regular penetration testing; SOC 2 Type II compliance in progress." },
      { heading: "5. Data Retention", body: "KYC documents are retained for 5 years after account closure as required by PMLA. Transaction records are retained for 10 years. Marketing preferences and communications are deleted on request." },
      { heading: "6. Your Rights", body: "Under DPDPA 2023, you have rights to: access your data; correct inaccurate data; request erasure (subject to legal obligations); withdraw consent; file complaints with DPDPA authority." },
      { heading: "7. Cookies", body: "We use essential cookies for platform functionality and optional analytics cookies. You can manage cookie preferences in your browser settings. We use cookie-free analytics where possible." },
      { heading: "8. Contact", body: "Data Protection Officer: dpo@zebvix.com\nZebvix Technologies Pvt Ltd\nKarkhana, Hyderabad — 500009, India" },
    ],
  },
  aml: {
    title: "AML/KYC Policy",
    icon: "shield",
    sections: [
      { heading: "Regulatory Framework", body: "Zebvix is registered as a Reporting Entity with FIU-IND under the Prevention of Money Laundering Act, 2002 (PMLA). We comply with the Virtual Digital Assets guidelines issued by PMLA and the Financial Intelligence Unit — India." },
      { heading: "KYC Tiers", body: "Level 0 (Basic): Read-only. No trading.\nLevel 1 (PAN): Trade up to ₹2L/day.\nLevel 2 (Aadhaar + Selfie): Full trading, withdrawals.\nLevel 3 (EDD): Institutional/high-value accounts." },
      { heading: "Sanctions Screening", body: "All users are screened against: UN Security Council Consolidated List; OFAC SDN List; EU Consolidated List; MHA Designated Terrorists List; India's PMLA Scheduled Offences list. Screening occurs at onboarding and daily thereafter." },
      { heading: "Transaction Monitoring", body: "We monitor transactions for: structuring (splitting transactions to avoid reporting thresholds); unusual patterns inconsistent with KYC profile; high-risk geography transactions; connections to flagged wallets using blockchain analytics." },
      { heading: "Reporting Obligations", body: "We file: Suspicious Transaction Reports (STR) within 7 days of detection; Cash Transaction Reports (CTR) for INR transactions >₹10L; Cross Border Wire Transfer Reports (CBWTR); Non-Profit Organisation Transaction Reports. All reports go to FIU-IND." },
      { heading: "Record Keeping", body: "All KYC documents, transaction records, and STR/CTR filings are maintained for a minimum of 5 years from the date of account closure as mandated by PMLA Rule 10." },
      { heading: "Contact", body: "AML Compliance Officer: aml@zebvix.com\nZebvix Technologies Pvt Ltd\nFIU-IND Registration No.: ZEBVIX-FIUIND-2024" },
    ],
  },
  risk: {
    title: "Risk Disclosure",
    icon: "alert-triangle",
    sections: [
      { heading: "Price Volatility", body: "Cryptocurrency prices can fluctuate dramatically within short periods. The value of your investments may decrease substantially or become worthless. Past performance is not indicative of future results." },
      { heading: "Leverage Risk", body: "Trading with leverage (up to 100×) amplifies both gains and losses. You may lose your entire margin and, in extreme cases, owe additional funds. Only trade with capital you can afford to lose entirely." },
      { heading: "Liquidity Risk", body: "Some markets may have low liquidity, resulting in significant slippage between expected and actual execution prices. Limit orders may not fill. Market orders in thin markets may execute at unfavorable prices." },
      { heading: "Technology Risk", body: "Technical failures, network congestion, cyberattacks, smart contract bugs, or exchange outages may prevent you from executing or cancelling orders at critical times, potentially leading to losses." },
      { heading: "Regulatory Risk", body: "Cryptocurrency regulations in India are evolving. Future regulatory changes may restrict trading, impose new taxes, or require reporting that affects your ability to use the platform or the value of your holdings." },
      { heading: "Counterparty Risk", body: "While we maintain 98% cold storage, no exchange is completely risk-free. Exchange failures, hacks, or insolvency events (as seen with other global exchanges) can result in partial or total loss of deposited funds." },
      { heading: "AI Trading Risk", body: "AI trading plans are based on algorithmic models and historical data. They do not guarantee profits. Market conditions may change in ways the AI has not encountered, leading to losses. You bear full responsibility for AI plan investments." },
      { heading: "Acknowledgement", body: "By using Zebvix, you acknowledge that you have read, understood, and accept these risks. You should seek independent financial advice before trading if you are unsure." },
    ],
  },
  fees: {
    title: "Fee Schedule",
    icon: "tag",
    sections: [
      { heading: "Spot Trading", body: "Maker Fee: 0.10%\nTaker Fee: 0.15%\nVIP 1 (30d vol >$50K): Maker 0.08% / Taker 0.10%\nVIP 2 (>$200K): Maker 0.06% / Taker 0.08%\nVIP 3 (>$1M): Maker 0.04% / Taker 0.06%\nMarket Maker (>$5M): Custom — contact us" },
      { heading: "Futures Trading", body: "Maker Fee: 0.02%\nTaker Fee: 0.06%\nFunding Rate: Every 8 hours (market-determined)\nLiquidation Fee: 0.50% of liquidated value\nInsurance Fund: 0.025% of position value" },
      { heading: "Options", body: "Options Contract Fee: 0.03% of notional\nExercise Fee: 0.015%\nEarly Exercise: Allowed (no additional fee)\nSettlement: Physically settled in USDT" },
      { heading: "Deposits", body: "INR Deposit (UPI/IMPS/NEFT): Free\nINR Deposit (RTGS): Free\nCrypto Deposit: Free (network fees apply)\nMinimum INR Deposit: ₹100" },
      { heading: "Withdrawals", body: "INR Withdrawal: ₹20 flat fee\nBTC: 0.0005 BTC\nETH: 0.005 ETH\nUSDT (TRC20): 1 USDT\nUSDT (ERC20): 15 USDT\nSOL: 0.01 SOL\nMinimum Withdrawal: ₹100 (INR), varies by crypto" },
      { heading: "P2P Trading", body: "P2P trades are zero-fee for makers and takers. Zebvix earns through a 0.1% escrow service fee charged to the buyer." },
      { heading: "Earn & Staking", body: "No platform fee on earn products. APY displayed is net of any platform charges. Early withdrawal from fixed plans may incur a 10% penalty on earned interest." },
      { heading: "AI Trading Plans", body: "Performance fee: 20% of profits generated. No management fee. Fee is deducted only when profits are realized and credited." },
    ],
  },
  cookies: {
    title: "Cookie Policy",
    icon: "coffee",
    sections: [
      { heading: "What Are Cookies", body: "Cookies are small text files placed on your device when you visit our website or use our mobile app. They help us provide functionality, remember preferences, and improve your experience." },
      { heading: "Essential Cookies", body: "Required for the platform to function. These include session cookies (authentication), security tokens (CSRF protection), and preference cookies (language, theme). Cannot be disabled." },
      { heading: "Analytics Cookies", body: "Help us understand how users navigate the platform. We use privacy-preserving analytics that do not share personal data with third parties. You can opt out in Settings." },
      { heading: "Marketing Cookies", body: "Used to show relevant promotions. We do not use cross-site tracking. Optional — disable in cookie preferences. Currently, we do not serve third-party advertising." },
      { heading: "Managing Cookies", body: "You can manage cookies through: (1) Platform Settings > Preferences; (2) Your browser settings; (3) Device privacy settings (for mobile). Disabling essential cookies will impair platform functionality." },
    ],
  },
};

export default function LegalPage() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { page } = useLocalSearchParams<{ page: string }>();

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const content = LEGAL_CONTENT[page ?? "terms"] ?? LEGAL_CONTENT.terms;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={["#0d1524", "#080e1a"]} style={[styles.header, { paddingTop: topPt + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{content.title}</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: botPt + 40 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.titleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name={content.icon as any} size={28} color={colors.primary} />
          <Text style={[styles.docTitle, { color: colors.foreground }]}>{content.title}</Text>
          <Text style={[styles.docDate, { color: colors.mutedForeground }]}>
            Last updated: January 1, 2025 · Zebvix Technologies Pvt Ltd
          </Text>
        </View>

        {content.sections.map((s, i) => (
          <View key={i} style={styles.section}>
            <Text style={[styles.heading, { color: colors.foreground }]}>{s.heading}</Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>{s.body}</Text>
          </View>
        ))}

        <View style={[styles.footer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="mail" size={16} color={colors.primary} />
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            Questions? Contact legal@zebvix.com
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700" },
  titleCard: { borderRadius: 16, borderWidth: 1, padding: 20, alignItems: "center", gap: 8, marginBottom: 20 },
  docTitle: { fontSize: 20, fontWeight: "800", textAlign: "center" },
  docDate: { fontSize: 12, textAlign: "center" },
  section: { marginBottom: 20 },
  heading: { fontSize: 15, fontWeight: "800", marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 22 },
  footer: { borderRadius: 12, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  footerText: { fontSize: 13 },
});
