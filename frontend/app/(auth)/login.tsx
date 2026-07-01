import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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
import { colors, radius, spacing } from '@/src/theme/tokens';

const HERO = 'https://images.unsplash.com/photo-1558678542-d52f29185251?crop=entropy&cs=srgb&fm=jpg&q=85&w=940';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
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
    setLoading(true);
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      await signIn(data.access_token, data.user);
      router.replace('/(app)/(tabs)');
    } catch (e: any) {
      setErr(e.message || 'Giriş başarısız');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Image source={{ uri: HERO }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
            <LinearGradient
              colors={['rgba(13,14,17,0.3)', 'rgba(13,14,17,0.9)', colors.surface]}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.heroContent}>
              <Text style={styles.eyebrow}>OTOEKSPERTİZ AI</Text>
              <Text style={styles.title}>Hoş geldin</Text>
              <Text style={styles.sub}>Aracını analiz etmek için giriş yap.</Text>
            </View>
          </View>

          <View style={styles.form}>
            <TextInput
              testID="login-email"
              placeholder="E-posta"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              testID="login-password"
              placeholder="Şifre"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            {err && <Text testID="login-error" style={styles.errText}>{err}</Text>}

            <Pressable
              testID="login-submit"
              onPress={submit}
              disabled={loading}
              style={({ pressed }) => [styles.primaryBtn, (pressed || loading) && { opacity: 0.75 }]}
            >
              {loading ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <>
                  <Ionicons name="log-in" size={20} color={colors.onBrandPrimary} />
                  <Text style={styles.primaryBtnText}>Giriş Yap</Text>
                </>
              )}
            </Pressable>

            <Pressable testID="go-register" onPress={() => router.push('/(auth)/register')} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>Hesabın yok mu? Kayıt ol</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  hero: { height: 280, justifyContent: 'flex-end' },
  heroContent: { padding: spacing.xl },
  eyebrow: { color: colors.brandSecondary, fontSize: 11, letterSpacing: 2, marginBottom: spacing.sm, fontWeight: '500' },
  title: { color: colors.onSurface, fontSize: 40, fontWeight: '500', marginBottom: spacing.sm },
  sub: { color: colors.onSurfaceSecondary, fontSize: 13 },
  form: { padding: spacing.xl, gap: spacing.md },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    color: colors.onSurface,
    fontSize: 15,
  },
  primaryBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: '500' },
  secondaryBtn: { paddingVertical: 14, alignItems: 'center' },
  secondaryBtnText: { color: colors.onSurfaceSecondary, fontSize: 13 },
  errText: { color: colors.error, fontSize: 13 },
});
