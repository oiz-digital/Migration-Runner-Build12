import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { setBaseUrl } from "@workspace/api-client-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" options={{ presentation: "modal" }} />
      <Stack.Screen name="register" options={{ presentation: "modal" }} />
      <Stack.Screen name="trade/[symbol]" />
      <Stack.Screen name="futures/index" />
      <Stack.Screen name="earn/index" />
      <Stack.Screen name="ai-trading/index" />
      <Stack.Screen name="p2p/index" />
      <Stack.Screen name="orders" />
      <Stack.Screen name="kyc/index" />
      <Stack.Screen name="wallet/[symbol]" />
      <Stack.Screen name="convert/index" />
      <Stack.Screen name="copy-trading/index" />
      <Stack.Screen name="portfolio/index" />
      <Stack.Screen name="notifications/index" />
      <Stack.Screen name="settings/index" />
      <Stack.Screen name="invite/index" />
      <Stack.Screen name="ledger/index" />
      <Stack.Screen name="price-alerts/index" />
      <Stack.Screen name="support/index" />
      <Stack.Screen name="options/index" />
      <Stack.Screen name="bots/index" />
      <Stack.Screen name="inr-payments/index" />
      <Stack.Screen name="discover/index" />
      <Stack.Screen name="legal/[page]" />
      <Stack.Screen name="trade-invoice/[id]" />
      <Stack.Screen name="ai-invoice/[id]" />
      <Stack.Screen name="futures-invoice/[id]" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
