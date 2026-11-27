import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ClerkLoaded, ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { setBaseUrl } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

// Prevent the splash screen from auto-hiding before asset loading is complete.
void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
const proxyUrl = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined;
const apiDomain = process.env.EXPO_PUBLIC_DOMAIN || "ultimate-master-build--yitayal647.replit.app";
if (apiDomain) setBaseUrl(`https://${apiDomain}`);

function RootLayoutNav() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerBackTitle: 'Back',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="comments/[videoId]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="creator/[username]" />
      <Stack.Screen name="video/[videoId]" />
      <Stack.Screen name="api/share/[videoId]" />
      <Stack.Screen name="people/[username]/[list]" />
      <Stack.Screen name="messages/[conversationId]" />
      <Stack.Screen name="favorites" />
      <Stack.Screen name="report/[userId]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="profile/edit" />
      <Stack.Screen name="settings" />
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
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;
  if (!publishableKey) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#080808', padding: 24 }}>
          <Text style={{ color: '#F6F1E7', fontFamily: 'Inter_600SemiBold', textAlign: 'center' }}>
            Sign-in configuration is missing. Set the Clerk publishable key for this app.
          </Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache} proxyUrl={proxyUrl}>
            <ClerkLoaded>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <KeyboardProvider>
                  <RootLayoutNav />
                </KeyboardProvider>
              </GestureHandlerRootView>
            </ClerkLoaded>
          </ClerkProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
