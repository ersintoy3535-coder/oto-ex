import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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

const HERO = 'https://images.pexels.com/photos/37532808/pexels-photo-37532808.png?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940';

const POPULAR = [
  { marka: 'Toyota', model: 'Corolla', yil: 2018 },
  { marka: 'Volkswagen', model: 'Passat', yil: 2016 },
  { marka: 'Ford', model: 'Focus', yil: 2015 },
  { marka: 'Renault', model: 'Megane', yil: 2019 },
  { marka: 'Honda', model: 'Civic', yil: 2017 },
  { marka: 'BMW', model: '3.20d', yil: 2015 },
];

export default function SearchScreen() {
  const { token } = useAuth();
  const { colors, themeName } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const [marka, setMarka] = useState('');
  const [model, setModel] = useState('');
  const [yil, setYil] = useState('');
  const [km, setKm] = useState('');
  const [fiyat, setFiyat] = useState('');
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);

  const gradientEnd = themeName === 'navy' ? 'rgba(10,22,40,0.85)' : 'rgba(13,14,17,0.85)';
  const gradientMid = themeName === 'navy' ? 'rgba(10,22,40,0.2)' : 'rgba(13,14,17,0.2)';

  const loadCredits = useCallback(async () => {
    try {
      const c = await apiFetch('/credits/me', {}, token);
      setCredits(c.credits ?? 0);
    } catch {}
  }, [token]);

  useFocusEffect(useCallback(() => { loadCredits(); }, [loadCredits]));

  const analyze = async () => {
    setErrMsg(null);
    if (credits !== null && credits <= 0) {
      router.push('/(app)/credits');
      return;
    }
    if (!marka.trim() || !model.trim() || !yil.trim()) {
      setErrMsg('Marka, model ve yıl zorunludur.');
      return;
    }
    const yilNum = parseInt(yil, 10);
    if (isNaN(yilNum) || yilNum < 1950 || yilNum > 2026) {
      setErrMsg('Yıl 1950-2026 arasında olmalı.');
      return;
    }
    setLoading(true);
    try {
      const report = await apiFetch(
        '/analyze',
        {
          method: 'POST',
          body: JSON.stringify({
            marka: marka.trim(),
            model: model.trim(),
            yil: yilNum,
            kilometre: km ? parseInt(km, 10) : undefined,
            istenilen_fiyat: fiyat ? parseFloat(fiyat) : undefined,
          }),
        },
        token,
      );
      await loadCredits();
      router.push({ pathname: '/(app)/report/[id]', params: { id: report.id } });
    } catch (e: any) {
      const raw = e.message || 'Analiz başarısız';
      // 402 insufficient credits
      if (raw.includes('insufficient_credits') || raw.includes('Sorgu hakkınız')) {
        router.push('/(app)/credits');
        return;
      }
      setErrMsg(raw);
    } finally {
      setLoading(false);
    }
  };

  const fillFrom = (p: { marka: string; model: string; yil: number }) => {
    setMarka(p.marka);
    setModel(p.model);
    setYil(String(p.yil));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Image source={{ uri: HERO }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
            <LinearGradient
              colors={[gradientMid, gradientEnd, colors.surface]}
              style={StyleSheet.absoluteFillObject}
            />

            <Pressable
              testID="credits-pill"
              onPress={() => router.push('/(app)/credits')}
              style={styles.creditsPill}
            >
              <Ionicons name="flash" size={14} color={colors.brand} />
              <Text style={styles.creditsPillText}>{credits ?? '—'}</Text>
              <Text style={styles.creditsPillSub}> sorgu</Text>
            </Pressable>

            <View style={styles.heroContent}>
              <Text style={styles.eyebrow} testID="app-eyebrow">OTOEKSPERTİZ AI</Text>
              <Text style={styles.title}>Aracını{'\n'}Analiz Et</Text>
              <Text style={styles.sub}>Marka, model ve yıl gir — kronik sorunlar, piyasa fiyatı, bakım maliyeti anında.</Text>
            </View>
          </View>

          <View style={styles.form}>
            <Text style={styles.sectionLabel}>ARAÇ BİLGİLERİ</Text>
            <TextInput
              testID="input-marka"
              placeholder="Marka (örn: Toyota)"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.input}
              value={marka}
              onChangeText={setMarka}
              autoCapitalize="words"
            />
            <TextInput
              testID="input-model"
              placeholder="Model (örn: Corolla 1.6)"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.input}
              value={model}
              onChangeText={setModel}
            />
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <TextInput
                testID="input-yil"
                placeholder="Yıl (2018)"
                placeholderTextColor={colors.onSurfaceTertiary}
                style={[styles.input, { flex: 1 }]}
                value={yil}
                onChangeText={setYil}
                keyboardType="number-pad"
                maxLength={4}
              />
              <TextInput
                testID="input-km"
                placeholder="Km (ops.)"
                placeholderTextColor={colors.onSurfaceTertiary}
                style={[styles.input, { flex: 1 }]}
                value={km}
                onChangeText={setKm}
                keyboardType="number-pad"
              />
            </View>
            <TextInput
              testID="input-fiyat"
              placeholder="Satıcının istediği fiyat TL (opsiyonel)"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.input}
              value={fiyat}
              onChangeText={setFiyat}
              keyboardType="numeric"
            />

            {errMsg && <Text testID="error-msg" style={styles.errText}>{errMsg}</Text>}

            {credits === 0 && (
              <View style={styles.warnBox} testID="no-credits-warn">
                <Ionicons name="alert-circle" size={18} color={colors.brand} />
                <Text style={styles.warnText}>Sorgu hakkın kalmadı. Reklam izle veya paket satın al.</Text>
              </View>
            )}

            <Pressable
              testID="btn-analyze"
              onPress={analyze}
              disabled={loading}
              style={({ pressed }) => [styles.primaryBtn, (pressed || loading) && { opacity: 0.75 }]}
            >
              {loading ? (
                <>
                  <ActivityIndicator color={colors.onBrandPrimary} />
                  <Text style={styles.primaryBtnText}>AI Analiz Ediyor…</Text>
                </>
              ) : credits === 0 ? (
                <>
                  <Ionicons name="flash" size={20} color={colors.onBrandPrimary} />
                  <Text style={styles.primaryBtnText}>Sorgu Hakkı Al</Text>
                </>
              ) : (
                <>
                  <Ionicons name="analytics" size={20} color={colors.onBrandPrimary} />
                  <Text style={styles.primaryBtnText}>Analizi Başlat</Text>
                </>
              )}
            </Pressable>
          </View>

          <View style={styles.popularWrap}>
            <Text style={styles.sectionLabel}>POPÜLER SEÇİMLER</Text>
            <View style={styles.popularGrid}>
              {POPULAR.map((p, i) => (
                <Pressable
                  key={i}
                  testID={`popular-${i}`}
                  onPress={() => fillFrom(p)}
                  style={({ pressed }) => [styles.popCard, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="car" size={22} color={colors.brandSecondary} />
                  <Text style={styles.popMarka}>{p.marka}</Text>
                  <Text style={styles.popModel}>{p.model} · {p.yil}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    scroll: { paddingBottom: spacing.xxxl },
    hero: { height: 260, position: 'relative', justifyContent: 'flex-end' },
    heroContent: { padding: spacing.xl },
    eyebrow: { color: colors.brandSecondary, fontSize: 11, letterSpacing: 2, marginBottom: spacing.sm, fontFamily: fonts.medium },
    title: { color: colors.onSurface, fontSize: 40, lineHeight: 44, marginBottom: spacing.md, fontFamily: fonts.semibold },
    sub: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
    creditsPill: {
      position: 'absolute',
      top: spacing.md,
      right: spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(0,0,0,0.55)',
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.brand,
      zIndex: 2,
    },
    creditsPillText: { color: colors.brand, fontSize: 14, fontFamily: fonts.semibold },
    creditsPillSub: { color: colors.onSurfaceSecondary, fontSize: 11, marginLeft: 2, fontFamily: fonts.regular },
    form: { padding: spacing.xl, gap: spacing.md },
    sectionLabel: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1.6, marginBottom: spacing.sm, fontFamily: fonts.medium },
    input: {
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: 14,
      color: colors.onSurface,
      fontSize: 15,
      fontFamily: fonts.regular,
    },
    warnBox: {
      backgroundColor: colors.brandTertiary,
      borderColor: colors.brand,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    warnText: { color: colors.onSurface, fontSize: 13, flex: 1, fontFamily: fonts.regular },
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
    primaryBtnText: { color: colors.onBrandPrimary, fontSize: 16, letterSpacing: 0.4, fontFamily: fonts.semibold },
    errText: { color: colors.error, fontSize: 13, fontFamily: fonts.regular },
    popularWrap: { paddingHorizontal: spacing.xl, marginTop: spacing.md },
    popularGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    popCard: {
      flexBasis: '47%',
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing.lg,
      gap: 4,
    },
    popMarka: { color: colors.onSurface, fontSize: 15, marginTop: spacing.xs, fontFamily: fonts.medium },
    popModel: { color: colors.onSurfaceTertiary, fontSize: 12, fontFamily: fonts.regular },
  });
