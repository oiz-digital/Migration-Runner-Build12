import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { G, Line, Rect } from "react-native-svg";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/hooks/useApi";

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface KlineResponse {
  symbol: string;
  interval: string;
  candles: Candle[];
}

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
type TF = (typeof TIMEFRAMES)[number];

const TF_LIMIT: Record<TF, number> = {
  "1m": 60, "5m": 60, "15m": 48, "1h": 48, "4h": 36, "1d": 60,
};

interface Props {
  symbol: string;
  height?: number;
}

export function CandleChart({ symbol, height = 220 }: Props) {
  const colors = useColors();
  const [tf, setTf] = useState<TF>("1h");
  const [layout, setLayout] = useState({ width: 0 });

  const { data, isLoading } = useQuery({
    queryKey: ["klines", symbol, tf],
    queryFn: () => apiFetch<KlineResponse>(`/api/klines?symbol=${symbol}USDT&interval=${tf}&limit=${TF_LIMIT[tf]}`),
    refetchInterval: tf === "1m" || tf === "5m" ? 10_000 : 60_000,
  });

  const { rects, volBars, labels } = useMemo(() => {
    const candles = data?.candles ?? [];
    if (!candles.length || !layout.width) return { rects: [], volBars: [], labels: [] };

    const W = layout.width;
    const chartH = height - 44; // leave 44 for volume bars
    const volH = 36;
    const PAD_L = 0;
    const PAD_R = 48;
    const drawW = W - PAD_L - PAD_R;
    const n = candles.length;
    const gap = drawW / n;
    const candleW = Math.max(1, gap * 0.65);

    const prices = candles.flatMap((c) => [c.high, c.low]);
    const pMin = Math.min(...prices);
    const pMax = Math.max(...prices);
    const pRange = pMax - pMin || 1;

    const vols = candles.map((c) => c.volume);
    const vMax = Math.max(...vols, 1);

    const toY = (p: number) => ((pMax - p) / pRange) * chartH;

    const rects = candles.map((c, i) => {
      const x = PAD_L + i * gap + (gap - candleW) / 2;
      const oY = toY(c.open);
      const cY = toY(c.close);
      const hY = toY(c.high);
      const lY = toY(c.low);
      const bodyTop = Math.min(oY, cY);
      const bodyH = Math.max(1, Math.abs(cY - oY));
      const isGreen = c.close >= c.open;
      return { x, bodyTop, bodyH, hY, lY, candleW, isGreen, midX: x + candleW / 2 };
    });

    const volBars = candles.map((c, i) => {
      const x = PAD_L + i * gap + (gap - candleW) / 2;
      const bH = Math.max(1, (c.volume / vMax) * volH);
      const isGreen = c.close >= c.open;
      return { x, h: bH, candleW, isGreen };
    });

    // Price labels on Y axis (3 labels)
    const steps = 4;
    const labels = Array.from({ length: steps + 1 }, (_, i) => {
      const p = pMin + (pRange * i) / steps;
      const y = toY(p);
      const label =
        p >= 1000
          ? p.toLocaleString("en-US", { maximumFractionDigits: 0 })
          : p < 0.01
            ? p.toFixed(6)
            : p.toFixed(2);
      return { y, label };
    });

    return { rects, volBars, labels };
  }, [data, layout.width, height, tf]);

  return (
    <View style={styles.container}>
      {/* Timeframe selector */}
      <View style={styles.tfRow}>
        {TIMEFRAMES.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tfBtn, { borderColor: colors.border }, t === tf && { backgroundColor: colors.primary, borderColor: colors.primary }]}
            onPress={() => setTf(t)}
          >
            <Text style={[styles.tfLabel, { color: t === tf ? "#fff" : colors.mutedForeground }]}>{t.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Chart */}
      <View
        style={[styles.chartArea, { height }]}
        onLayout={(e) => setLayout({ width: e.nativeEvent.layout.width })}
      >
        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} size="small" />
          </View>
        ) : layout.width > 0 && rects.length > 0 ? (
          <Svg width={layout.width} height={height}>
            {/* Candlesticks */}
            {rects.map((r, i) => (
              <G key={i}>
                {/* Wick */}
                <Line
                  x1={r.midX}
                  y1={r.hY}
                  x2={r.midX}
                  y2={r.lY}
                  stroke={r.isGreen ? "#22c55e" : "#e81515"}
                  strokeWidth="1"
                />
                {/* Body */}
                <Rect
                  x={r.x}
                  y={r.bodyTop}
                  width={r.candleW}
                  height={r.bodyH}
                  fill={r.isGreen ? "#22c55e" : "#e81515"}
                  opacity={r.isGreen ? 0.9 : 0.85}
                />
              </G>
            ))}

            {/* Volume bars */}
            {volBars.map((b, i) => (
              <Rect
                key={`vol${i}`}
                x={b.x}
                y={height - b.h}
                width={b.candleW}
                height={b.h}
                fill={b.isGreen ? "#22c55e" : "#e81515"}
                opacity={0.3}
              />
            ))}

            {/* Y axis labels */}
            {labels.map((l, i) => (
              <Svg key={i} x={layout.width - 47} y={l.y - 7} width={48} height={14}>
                <Rect x={0} y={0} width={48} height={14} fill="transparent" />
              </Svg>
            ))}
          </Svg>
        ) : (
          <View style={styles.loading}>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Loading chart...</Text>
          </View>
        )}

        {/* Y axis price labels overlay */}
        {labels.map((l, i) => (
          <Text
            key={i}
            style={[styles.yLabel, { top: l.y - 7, color: colors.mutedForeground }]}
            numberOfLines={1}
          >
            {l.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  tfRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  tfBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    borderWidth: 1,
  },
  tfLabel: { fontSize: 11, fontWeight: "700" },
  chartArea: { position: "relative", marginHorizontal: 0 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  yLabel: {
    position: "absolute",
    right: 0,
    width: 46,
    fontSize: 9,
    fontWeight: "500",
    textAlign: "right",
    paddingRight: 2,
  },
});
