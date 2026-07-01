import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/src/auth/AuthContext';
import { colors, radius, spacing } from '@/src/theme/tokens';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();

  const initials = (user?.full_name || user?.email || '?').substring(0, 2).toUpperCase();

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
        <Text style={styles.sectionLabel}>UYGULAMA</Text>
        <InfoRow icon="information-circle" title="Sürüm" value="1.0.0" />
        <InfoRow icon="sparkles" title="AI Modeli" value="Gemini 2.5 Pro" />
        <InfoRow icon="shield-checkmark" title="Analiz Kapsamı" value="Kronik sorunlar · Piyasa fiyatı · Bakım maliyeti" multiline />
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

function InfoRow({ icon, title, value, multiline }: any) {
  return (
    <View style={styles.row}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={18} color={colors.brandSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowValue} numberOfLines={multiline ? 3 : 1}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.xl, paddingBottom: spacing.md },
  eyebrow: { color: colors.brandSecondary, fontSize: 11, letterSpacing: 2, marginBottom: spacing.xs, fontWeight: '500' },
  title: { color: colors.onSurface, fontSize: 30, fontWeight: '500' },
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
  avatarText: { color: colors.brand, fontSize: 20, fontWeight: '500' },
  name: { color: colors.onSurface, fontSize: 16, fontWeight: '500' },
  email: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  section: { paddingHorizontal: spacing.xl, marginTop: spacing.xl, gap: spacing.sm },
  sectionLabel: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1.6, marginBottom: spacing.xs, fontWeight: '500' },
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
  rowTitle: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1, fontWeight: '500' },
  rowValue: { color: colors.onSurface, fontSize: 14, marginTop: 2 },
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
  logoutText: { color: colors.error, fontSize: 15, fontWeight: '500' },
});
