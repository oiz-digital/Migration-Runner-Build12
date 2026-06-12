import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { PriceChange } from "@/components/PriceChange";

const COIN_COLORS: Record<string, string> = {
  BTC: "#f7931a", ETH: "#627eea", BNB: "#f3ba2f", XRP: "#346aa9",
  SOL: "#9945ff", ADA: "#3cc8c8", DOGE: "#c2a633", MATIC: "#8247e5",
  DOT: "#e6007a", LINK: "#2a5ada", AVAX: "#e84142", NEAR: "#00c08b",
  LTC: "#bfbbbb", UNI: "#ff007a", ATOM: "#6f4e7c", TRX: "#ef0027",
  USDT: "#26a17b", USDC: "#2775ca", DEFAULT: "#6b7a9e",
};

interface Props {
  symbol: string;
  name?: string;
  price: number;
  change24h: number;
  volume?: number;
  quote?: "USDT" | "INR";
  onPress?: () => void;
}

export function CoinRow({ symbol, name, price, change24h, volume, quote = "USDT", onPress }: Props) {
  const colors = useColors();
  const bg = COIN_COLORS[symbol.toUpperCase()] ?? COIN_COLORS.DEFAULT;
  const priceStr = quote === "INR"
    ? `₹${price >= 1000 ? price.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : price.toFixed(price < 0.01 ? 6 : 2)}`
    : price < 0.001
      ? `$${price.toFixed(6)}`
      : price < 1
        ? `$${price.toFixed(4)}`
        : `$${price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

  const volStr = volume
    ? volume > 1_000_000_000
      ? `$${(volume / 1e9).toFixed(1)}B`
      : volume > 1_000_000
        ? `$${(volume / 1e6).toFixed(1)}M`
        : `$${(volume / 1e3).toFixed(0)}K`
    : "";

  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.icon, { backgroundColor: bg + "22" }]}>
        <Text style={[styles.iconText, { color: bg }]}>{symbol.charAt(0)}</Text>
      </View>
      <View style={styles.info}>
        <Text style={[styles.symbol, { color: colors.foreground }]}>{symbol}</Text>
        {name ? <Text style={[styles.name, { color: colors.mutedForeground }]} numberOfLines={1}>{name}</Text> : null}
      </View>
      <View style={styles.right}>
        <Text style={[styles.price, { color: colors.foreground }]}>{priceStr}</Text>
        <View style={styles.rightBottom}>
          {volStr ? <Text style={[styles.vol, { color: colors.mutedForeground }]}>{volStr}</Text> : null}
          <PriceChange value={change24h} style={styles.change} />
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
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  iconText: { fontSize: 18, fontWeight: "700" },
  info: { flex: 1, marginRight: 8 },
  symbol: { fontSize: 15, fontWeight: "600" },
  name: { fontSize: 12, marginTop: 2 },
  right: { alignItems: "flex-end" },
  price: { fontSize: 15, fontWeight: "600" },
  rightBottom: { flexDirection: "row", alignItems: "center", marginTop: 2, gap: 6 },
  vol: { fontSize: 11 },
  change: {},
});
