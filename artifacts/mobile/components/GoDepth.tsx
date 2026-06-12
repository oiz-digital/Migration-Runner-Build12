import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import type { DepthLevel } from "@/hooks/useGoFuturesWs";

interface Props {
  bids: DepthLevel[];
  asks: DepthLevel[];
  lastPrice: number;
  width?: number;
  height?: number;
  maxLevels?: number;
}

function fmt(p: number): string {
  if (p >= 10000) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 100) return p.toFixed(2);
  return p.toFixed(4);
}

function fmtQty(q: number): string {
  if (q >= 1000) return `${(q / 1000).toFixed(1)}K`;
  return q.toFixed(3);
}

export function GoDepth({ bids, asks, lastPrice, width = 340, height = 80, maxLevels = 8 }: Props) {
  const displayBids = bids.slice(0, maxLevels);
  const displayAsks = asks.slice(0, maxLevels);

  const maxBidQty = useMemo(() => Math.max(...displayBids.map((b) => b.qty), 0.001), [displayBids]);
  const maxAskQty = useMemo(() => Math.max(...displayAsks.map((a) => a.qty), 0.001), [displayAsks]);
  const maxQty = Math.max(maxBidQty, maxAskQty);

  const BAR_H = (height - 4) / maxLevels;
  const halfW = (width - 80) / 2;

  if (bids.length === 0 && asks.length === 0) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={styles.emptyText}>Awaiting orderbook...</Text>
      </View>
    );
  }

  return (
    <View style={{ width, overflow: "hidden" }}>
      <Svg width={width} height={height}>
        {displayBids.map((b, i) => {
          const barW = (b.qty / maxQty) * halfW;
          const y = i * BAR_H;
          return (
            <Rect
              key={`bid-${i}`}
              x={halfW - barW}
              y={y + 1}
              width={barW}
              height={BAR_H - 2}
              fill="#0ECB8118"
              rx={2}
            />
          );
        })}
        {displayAsks.map((a, i) => {
          const barW = (a.qty / maxQty) * halfW;
          const y = i * BAR_H;
          return (
            <Rect
              key={`ask-${i}`}
              x={halfW + 80}
              y={y + 1}
              width={barW}
              height={BAR_H - 2}
              fill="#F6465D18"
              rx={2}
            />
          );
        })}
      </Svg>

      <View style={[StyleSheet.absoluteFillObject, { flexDirection: "row" }]}>
        <View style={{ width: halfW }}>
          {displayBids.map((b, i) => (
            <View key={i} style={[styles.levelRow, { height: BAR_H, justifyContent: "flex-end" }]}>
              <Text style={[styles.price, { color: "#0ECB81" }]}>{fmt(b.price)}</Text>
            </View>
          ))}
        </View>

        <View style={{ width: 80, alignItems: "center", justifyContent: "center" }}>
          <Text style={styles.midPrice}>{lastPrice > 0 ? fmt(lastPrice) : "—"}</Text>
        </View>

        <View style={{ width: halfW }}>
          {displayAsks.map((a, i) => (
            <View key={i} style={[styles.levelRow, { height: BAR_H }]}>
              <Text style={[styles.price, { color: "#F6465D" }]}>{fmt(a.price)}</Text>
              <Text style={styles.qty}>{fmtQty(a.qty)}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", justifyContent: "center" },
  emptyText: { color: "#6b7a9e", fontSize: 12 },
  levelRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4, gap: 4 },
  price: { fontSize: 10, fontWeight: "700", fontVariant: ["tabular-nums"] },
  qty: { fontSize: 9, color: "#6b7a9e", fontVariant: ["tabular-nums"] },
  midPrice: { fontSize: 12, fontWeight: "800", color: "#eb9100", fontVariant: ["tabular-nums"] },
});
