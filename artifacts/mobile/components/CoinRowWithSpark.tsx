import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { SparkLine } from "@/components/SparkLine";
import { AnimatedPrice } from "@/components/AnimatedPrice";

const COIN_COLORS: Record<string, string> = {
  BTC: "#f7931a", ETH: "#627eea", BNB: "#f3ba2f", XRP: "#346aa9",
  SOL: "#9945ff", ADA: "#3cc8c8", DOGE: "#c2a633", MATIC: "#8247e5",
  DOT: "#e6007a", LINK: "#2a5ada", AVAX: "#e84142", NEAR: "#00c08b",
  LTC: "#bfbbbb", UNI: "#ff007a", USDT: "#26a17b", USDC: "#2775ca",
  DEFAULT: "#6b7a9e",
};

interface Props {
  symbol: string;
  name?: string;
  price: number;
  change24h: number;
  volume?: number;
  sparkData?: number[];
  rank?: number;
  quote?: "USDT" | "INR";
  onPress?: () => void;
}

export function CoinRowWithSpark({ symbol, name, price, change24h, volume, sparkData, rank, quote = "USDT", onPress }: Props) {
  const colors = useColors();
  const bg = COIN_COLORS[symbol.toUpperCase()] ?? COIN_COLORS.DEFAULT;
  const isPos = change24h >= 0;

  const fmtPrice = (p: number) => {
    if (quote === "INR") {
      return p >= 1000
        ? `₹${p.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
        : `₹${p.toFixed(p < 0.01 ? 6 : 2)}`;
    }
    return p < 0.001 ? `$${p.toFixed(6)}` : p < 1 ? `$${p.toFixed(4)}` : `$${p.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  };

  const volStr = volume
    ? volume > 1e9 ? `$${(volume / 1e9).toFixed(1)}B` : volume > 1e6 ? `$${(volume / 1e6).toFixed(1)}M` : `$${(volume / 1e3).toFixed(0)}K`
    : "";

  return (
    <TouchableOpacity style={[styles.row, { borderBottomColor: colors.border }]} onPress={onPress} activeOpacity={0.7}>
      {rank !== undefined && (
        <Text style={[styles.rank, { color: colors.mutedForeground }]}>{rank}</Text>
      )}
      <View style={[styles.icon, { backgroundColor: bg + "22" }]}>
        <Text style={[styles.iconText, { color: bg }]}>{symbol.charAt(0)}</Text>
      </View>
      <View style={styles.info}>
        <Text style={[styles.symbol, { color: colors.foreground }]}>{symbol}</Text>
        {name ? <Text style={[styles.name, { color: colors.mutedForeground }]} numberOfLines={1}>{name}</Text>
          : volStr ? <Text style={[styles.name, { color: colors.mutedForeground }]}>{volStr}</Text> : null}
      </View>

      {sparkData && sparkData.length > 1 ? (
        <View style={styles.spark}>
          <SparkLine data={sparkData} width={60} height={30} positive={isPos} id={symbol} />
        </View>
      ) : (
        <View style={styles.spark} />
      )}

      <View style={styles.right}>
        <AnimatedPrice price={price} format={fmtPrice} style={[styles.price, { color: colors.foreground }]} />
        <View style={[styles.changeBadge, { backgroundColor: isPos ? "#22c55e20" : "#e8151520" }]}>
          <Text style={[styles.changePct, { color: isPos ? colors.success : colors.destructive }]}>
            {isPos ? "+" : ""}{change24h.toFixed(2)}%
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  rank: { width: 20, fontSize: 11, textAlign: "center" },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  iconText: { fontSize: 16, fontWeight: "700" },
  info: { flex: 1 },
  symbol: { fontSize: 14, fontWeight: "700" },
  name: { fontSize: 11, marginTop: 1 },
  spark: { width: 62, height: 30, marginHorizontal: 4 },
  right: { alignItems: "flex-end", gap: 4 },
  price: { fontSize: 14, fontWeight: "700" },
  changeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 5 },
  changePct: { fontSize: 12, fontWeight: "700" },
});
