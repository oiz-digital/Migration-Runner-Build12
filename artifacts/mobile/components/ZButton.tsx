import React from "react";
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  ViewStyle,
} from "react-native";
import { useColors } from "@/hooks/useColors";

interface Props {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "outline" | "buy" | "sell";
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
}

export function ZButton({ label, onPress, variant = "primary", loading, disabled, style, fullWidth }: Props) {
  const colors = useColors();

  const bg = variant === "primary"
    ? colors.primary
    : variant === "buy"
      ? "#22c55e"
      : variant === "sell"
        ? "#e81515"
        : variant === "danger"
          ? colors.destructive
          : variant === "outline"
            ? "transparent"
            : colors.secondary;

  const fg = variant === "outline" ? colors.primary : "#ffffff";
  const borderColor = variant === "outline" ? colors.primary : "transparent";

  return (
    <TouchableOpacity
      style={[
        styles.btn,
        { backgroundColor: bg, borderColor },
        variant === "outline" && styles.outline,
        fullWidth && styles.fullWidth,
        (disabled || loading) && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading
        ? <ActivityIndicator color={fg} size="small" />
        : <Text style={[styles.label, { color: fg }]}>{label}</Text>
      }
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 48,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  outline: { borderWidth: 1.5 },
  fullWidth: { width: "100%" },
  disabled: { opacity: 0.5 },
  label: { fontSize: 15, fontWeight: "700", letterSpacing: 0.3 },
});
