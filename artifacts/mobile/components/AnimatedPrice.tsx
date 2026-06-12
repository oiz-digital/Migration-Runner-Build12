import React, { useEffect, useRef } from "react";
import { StyleProp, StyleSheet, TextStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";

interface Props {
  price: number;
  format?: (p: number) => string;
  style?: StyleProp<TextStyle>;
  prefix?: string;
}

export function AnimatedPrice({ price, format, style, prefix = "" }: Props) {
  const prevRef = useRef(price);
  const flash = useSharedValue(0);
  const isUp = useSharedValue(true);

  useEffect(() => {
    if (price !== prevRef.current) {
      isUp.value = price > prevRef.current;
      prevRef.current = price;
      flash.value = withSequence(
        withTiming(1, { duration: 80 }),
        withDelay(300, withTiming(0, { duration: 400 }))
      );
    }
  }, [price]);

  const animStyle = useAnimatedStyle(() => ({
    backgroundColor:
      flash.value > 0
        ? isUp.value
          ? `rgba(14,203,129,${flash.value * 0.35})`
          : `rgba(246,70,93,${flash.value * 0.35})`
        : "transparent",
  }));

  const priceStr = format ? format(price) : price.toLocaleString("en-US", { maximumFractionDigits: 2 });

  return (
    <Animated.Text style={[styles.price, style, animStyle]}>
      {prefix}{priceStr}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  price: { fontSize: 15, fontWeight: "700", borderRadius: 3, paddingHorizontal: 2 },
});
