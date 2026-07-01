import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiFetch, useAuth } from '@/src/auth/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { fonts, radius, spacing, ThemeColors } from '@/src/theme/tokens';

export default function RegisterScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!email.trim() || !password.trim()) {
      setErr('E-posta ve şifre zorunludur.');
      return;
    }
    if (password.length < 6) {
      setErr('Şifre en az 6 karakter olmalı.');
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          full_name: name.trim() || null,
        }),
      });
      await signIn(data.access_token, data.user);
      router.replace('/(app)/(tabs)');
    } catch (e: any) {
      setErr(e.message || 'Kayıt başarısız');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: spacing.xl }} keyboardShouldPersistTaps="handled">
          <Pressable testID="back-btn" onPress={() => router.back()} style={styles.back} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
          </Pressable>

          <View style={{ marginTop: spacing.xxl, marginBottom: spacing.xl }}>
            <Text style={styles.eyebrow}>YENİ HESAP</Text>
            <Text style={styles.title}>Kayıt ol</Text>
            <Text style={styles.sub}>Analizlerini kaydet, geçmişine ve favorilerine ulaş.</Text>
          </View>

          <TextInput
            testID="reg-name"
            placeholder="Ad Soyad (ops.)"
            placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.input}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            testID="reg-email"
            placeholder="E-posta"
            placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            testID="reg-password"
            placeholder="Şifre (min 6 karakter)"
            placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {err && <Text testID="reg-error" style={styles.errText}>{err}</Text>}

          <Pressable
            testID="reg-submit"
            onPress={submit}
            disabled={loading}
            style={({ pressed }) => [styles.primaryBtn, (pressed || loading) && { opacity: 0.75 }]}
          >
            {loading ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Text style={styles.primaryBtnText}>Hesap Oluştur</Text>
            )}
          </Pressable>

          <Pressable testID="go-login" onPress={() => router.replace('/(auth)/login')} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>Zaten hesabın var mı? Giriş yap</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    back: { alignSelf: 'flex-start', padding: spacing.sm },
    eyebrow: { color: colors.brandSecondary, fontSize: 11, letterSpacing: 2, marginBottom: spacing.sm, fontFamily: fonts.medium },
    title: { color: colors.onSurface, fontSize: 34, marginBottom: spacing.sm, fontFamily: fonts.semibold },
    sub: { color: colors.onSurfaceSecondary, fontSize: 13, fontFamily: fonts.regular },
    input: {
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: 14,
      color: colors.onSurface,
      fontSize: 15,
      marginBottom: spacing.md,
      fontFamily: fonts.regular,
    },
    primaryBtn: {
      backgroundColor: colors.brand,
      borderRadius: radius.md,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.sm,
    },
    primaryBtnText: { color: colors.onBrandPrimary, fontSize: 16, fontFamily: fonts.semibold },
    secondaryBtn: { paddingVertical: 14, alignItems: 'center' },
    secondaryBtnText: { color: colors.onSurfaceSecondary, fontSize: 13, fontFamily: fonts.regular },
    errText: { color: colors.error, fontSize: 13, marginTop: spacing.xs, marginBottom: spacing.sm, fontFamily: fonts.regular },
  });
