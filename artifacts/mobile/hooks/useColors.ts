import { useColorScheme } from "react-native";
import colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";

export function useColors() {
  const { theme } = useTheme();
  const systemScheme = useColorScheme() ?? "dark";
  const resolved = theme === "system" ? systemScheme : theme;
  const palette = colors[resolved] ?? colors.dark;
  return { ...palette, radius: colors.radius };
}
