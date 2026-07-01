import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, LogBox, StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useIconFonts } from '@/src/hooks/use-icon-fonts';
import { usePoppinsFonts } from '@/src/hooks/use-poppins';
import { AuthProvider, useAuth } from '@/src/auth/AuthContext';
import { ThemeProvider, useTheme } from '@/src/theme/ThemeContext';

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

function RootNav() {
  const { token, loading } = useAuth();
  const { colors } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    const inAppGroup = segments[0] === '(app)';
    if (!token && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (token && !inAppGroup) {
      router.replace('/(app)/(tabs)');
    }
  }, [token, segments, loading, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}

function ThemedStatusBar() {
  const { colors } = useTheme();
  return <StatusBar barStyle="light-content" backgroundColor={colors.surface} />;
}

export default function RootLayout() {
  const [iconsLoaded, iconsError] = useIconFonts();
  const [poppinsLoaded, poppinsError] = usePoppinsFonts();

  const ready = (iconsLoaded || iconsError) && (poppinsLoaded || poppinsError);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ThemedStatusBar />
          <AuthProvider>
            <RootNav />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
