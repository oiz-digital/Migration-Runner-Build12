import React, { useMemo } from "react";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

interface Props {
  data: number[];
  width?: number;
  height?: number;
  positive?: boolean;
  id?: string;
}

export function SparkLine({ data, width = 60, height = 32, positive = true, id = "spark" }: Props) {
  const { linePath, fillPath } = useMemo(() => {
    if (!data || data.length < 2) return { linePath: "", fillPath: "" };
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pts = data.map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return { x, y };
    });
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const fill =
      `M0,${height} ` +
      pts.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") +
      ` L${width},${height} Z`;
    return { linePath: line, fillPath: fill };
  }, [data, width, height]);

  if (!linePath) return <View style={{ width, height }} />;

  const color = positive ? "#0ECB81" : "#F6465D";
  const gradId = `${id}_grad`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.25" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={fillPath} fill={`url(#${gradId})`} />
      <Path d={linePath} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
