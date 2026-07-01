import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/src/theme/ThemeContext';
import { fonts, spacing, ThemeColors } from '@/src/theme/tokens';

/**
 * Stripe redirect landing route on web. Native uses openAuthSessionAsync
 * which auto-closes, but on web the browser navigates here. We just
 * bounce back to /credits which will poll session status.
 */
export default function CheckoutReturn() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { status } = useLocalSearchParams<{ status?: string; session_id?: string }>();

  useEffect(() => {
    const t = setTimeout(() => {
      router.replace('/(app)/credits');
    }, 800);
    return () => clearTimeout(t);
  }, [router]);

  const success = status === 'success';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <Ionicons
          name={success ? 'checkmark-circle' : 'close-circle'}
          size={64}
          color={success ? colors.success : colors.error}
        />
        <Text style={styles.title}>{success ? 'Ödeme Alındı' : 'İptal Edildi'}</Text>
        <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.lg }} />
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
    title: { color: colors.onSurface, fontSize: 20, fontFamily: fonts.semibold },
  });
