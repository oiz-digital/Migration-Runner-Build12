import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface Stat {
  label: string;
  value: string;
  valueColor?: string;
}

interface Props {
  stats: Stat[];
}

export function StatsBar({ stats }: Props) {
  const colors = useColors();
  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {stats.map((s, i) => (
        <React.Fragment key={s.label}>
          <View style={styles.stat}>
            <Text style={[styles.value, { color: s.valueColor ?? colors.foreground }]}>{s.value}</Text>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>{s.label}</Text>
          </View>
          {i < stats.length - 1 && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginHorizontal: 16,
    marginBottom: 12,
  },
  stat: { flex: 1, alignItems: "center", paddingVertical: 10 },
  value: { fontSize: 14, fontWeight: "700" },
  label: { fontSize: 10, marginTop: 2, fontWeight: "500" },
  sep: { width: StyleSheet.hairlineWidth },
});
