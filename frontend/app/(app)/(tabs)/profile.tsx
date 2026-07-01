import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMemo } from 'react';

import { useAuth } from '@/src/auth/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { fonts, radius, spacing, ThemeColors, ThemeName } from '@/src/theme/tokens';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { colors, themeName, setTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const initials = (user?.full_name || user?.email || '?').substring(0, 2).toUpperCase();

  const themeOptions: { key: ThemeName; label: string; swatches: [string, string]; desc: string }[] = [
    { key: 'navy', label: 'Navy Blue', swatches: ['#0A1628', '#FFC93C'], desc: 'Koyu lacivert · Sarı vurgu' },
    { key: 'dark', label: 'Carbon Dark', swatches: ['#0D0E11', '#E63946'], desc: 'Koyu karbon · Kırmızı vurgu' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>HESAP</Text>
        <Text style={styles.title}>Profil</Text>
      </View>

      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{user?.full_name || 'Kullanıcı'}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>TEMA</Text>
        {themeOptions.map((opt) => {
          const active = themeName === opt.key;
          return (
            <Pressable
              key={opt.key}
              testID={`theme-${opt.key}`}
              onPress={() => setTheme(opt.key)}
              style={({ pressed }) => [styles.themeRow, active && styles.themeRowActive, pressed && { opacity: 0.75 }]}
            >
              <View style={styles.swatchWrap}>
                <View style={[styles.swatch, { backgroundColor: opt.swatches[0], borderColor: colors.border }]} />
                <View style={[styles.swatch, styles.swatchAccent, { backgroundColor: opt.swatches[1], borderColor: colors.border }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.themeLabel}>{opt.label}</Text>
                <Text style={styles.themeDesc}>{opt.desc}</Text>
              </View>
              <Ionicons
                name={active ? 'radio-button-on' : 'radio-button-off'}
                size={22}
                color={active ? colors.brand : colors.onSurfaceTertiary}
              />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>UYGULAMA</Text>
        <InfoRow icon="information-circle" title="Sürüm" value="1.0.0" colors={colors} styles={styles} />
        <InfoRow icon="sparkles" title="AI Modeli" value="Gemini 2.5 Pro" colors={colors} styles={styles} />
        <InfoRow icon="shield-checkmark" title="Analiz Kapsamı" value="Kronik sorunlar · Piyasa fiyatı · Bakım" colors={colors} styles={styles} />
      </View>

      <Pressable
        testID="logout-btn"
        onPress={signOut}
        style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="log-out-outline" size={20} color={colors.error} />
        <Text style={styles.logoutText}>Çıkış Yap</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function InfoRow({ icon, title, value, colors, styles }: any) {
  return (
    <View style={styles.row}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={18} color={colors.brandSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowValue} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    header: { padding: spacing.xl, paddingBottom: spacing.md },
    eyebrow: { color: colors.brandSecondary, fontSize: 11, letterSpacing: 2, marginBottom: spacing.xs, fontFamily: fonts.medium },
    title: { color: colors.onSurface, fontSize: 28, fontFamily: fonts.semibold },
    profileCard: {
      marginHorizontal: spacing.xl,
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    avatar: { width: 56, height: 56, borderRadius: radius.pill, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.brand },
    avatarText: { color: colors.brand, fontSize: 20, fontFamily: fonts.semibold },
    name: { color: colors.onSurface, fontSize: 16, fontFamily: fonts.semibold },
    email: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2, fontFamily: fonts.regular },
    section: { paddingHorizontal: spacing.xl, marginTop: spacing.xl, gap: spacing.sm },
    sectionLabel: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1.6, marginBottom: spacing.xs, fontFamily: fonts.medium },
    themeRow: {
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    themeRowActive: {
      borderColor: colors.brand,
      backgroundColor: colors.brandTertiary,
    },
    swatchWrap: { flexDirection: 'row', width: 48, height: 40, position: 'relative' },
    swatch: { width: 28, height: 28, borderRadius: 8, borderWidth: 1 },
    swatchAccent: { position: 'absolute', left: 18, top: 8, width: 22, height: 22 },
    themeLabel: { color: colors.onSurface, fontSize: 14, fontFamily: fonts.semibold },
    themeDesc: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2, fontFamily: fonts.regular },
    row: {
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    iconWrap: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
    rowTitle: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1, fontFamily: fonts.medium },
    rowValue: { color: colors.onSurface, fontSize: 14, marginTop: 2, fontFamily: fonts.regular },
    logoutBtn: {
      marginTop: spacing.xxl,
      marginHorizontal: spacing.xl,
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.error,
      borderWidth: 1,
      borderRadius: radius.md,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    logoutText: { color: colors.error, fontSize: 15, fontFamily: fonts.semibold },
  });
