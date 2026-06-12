import React from "react";
import { StyleProp, StyleSheet, Text, TextStyle } from "react-native";

interface Props {
  value: number;
  style?: StyleProp<TextStyle>;
  fontSize?: number;
}

export function PriceChange({ value, style, fontSize = 12 }: Props) {
  const isPos = value >= 0;
  const color = isPos ? "#22c55e" : "#e81515";
  const sign = isPos ? "+" : "";
  return (
    <Text style={[styles.text, { color, fontSize }, style]}>
      {sign}{value.toFixed(2)}%
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { fontWeight: "600" },
});
