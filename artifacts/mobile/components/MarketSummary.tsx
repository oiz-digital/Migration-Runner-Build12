import React, { useEffect, useRef } from "react";
import { Animated, ScrollView, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { usePrices } from "@/hooks/usePrices";

export function MarketSummary() {
  const colors = useColors();
  const { ticks, priceMap } = usePrices();

  const btc = priceMap["BTC"];
  const eth = priceMap["ETH"];
  const sol = priceMap["SOL"];
  const bnb = priceMap["BNB"];

  const totalVol = ticks.reduce((s, t) => s + (t.volume24h ?? 0) * (t.usdt ?? 0), 0);
  const gainers = ticks.filter((t) => t.change24h > 0).length;
  const losers = ticks.filter((t) => t.change24h < 0).length;
  const totalCoins = ticks.filter((t) => t.usdt > 0).length;

  const scrollX = useRef(new Animated.Value(0)).current;
  const ticker = [
    btc && `BTC $${btc.usdt.toLocaleString("en-US", { maximumFractionDigits: 0 })} (${btc.change24h >= 0 ? "+" : ""}${btc.change24h.toFixed(2)}%)`,
    eth && `ETH $${eth.usdt.toFixed(2)} (${eth.change24h >= 0 ? "+" : ""}${eth.change24h.toFixed(2)}%)`,
    sol && `SOL $${sol.usdt.toFixed(2)} (${sol.change24h >= 0 ? "+" : ""}${sol.change24h.toFixed(2)}%)`,
    bnb && `BNB $${bnb.usdt.toFixed(2)} (${bnb.change24h >= 0 ? "+" : ""}${bnb.change24h.toFixed(2)}%)`,
    totalCoins > 0 && `Markets: ${gainers} gainers / ${losers} losers of ${totalCoins}`,
    totalVol > 0 && `24h Vol: $${(totalVol / 1e9).toFixed(1)}B`,
  ].filter(Boolean) as string[];

  const items = [...ticker, ...ticker];

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        contentOffset={{ x: 0, y: 0 }}
      >
        <View style={styles.ticker}>
          {items.map((t, i) => {
            const isPos = t.includes("+") || (!t.includes("-") && !t.includes("(−"));
            const color = t.includes("%")
              ? t.includes("+")
                ? colors.success
                : colors.destructive
              : colors.mutedForeground;
            return (
              <React.Fragment key={i}>
                <Text style={[styles.tickerItem, { color }]}>{t}</Text>
                <Text style={[styles.sep, { color: colors.border }]}>•</Text>
              </React.Fragment>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    paddingVertical: 6,
    overflow: "hidden",
  },
  ticker: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    gap: 0,
  },
  tickerItem: { fontSize: 11, fontWeight: "600", marginHorizontal: 6 },
  sep: { fontSize: 10 },
});
