import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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

type Stats = {
  total_users: number;
  total_reports: number;
  week_analyses: number;
  total_favorites: number;
  total_chats: number;
  ad_rewards: number;
  stripe_fulfilled_count: number;
  stripe_revenue_usd: number;
  iap_count: number;
};

type AdminUser = {
  id: string;
  email: string;
  full_name?: string | null;
  query_credits: number;
  is_admin: boolean;
  created_at: string;
  report_count: number;
};

type Txn = {
  id: string;
  user_id: string;
  delta: number;
  reason: string;
  created_at: string;
};

export default function AdminScreen() {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();

  const [tab, setTab] = useState<'stats' | 'users' | 'txns' | 'payments'>('stats');
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [payments, setPayments] = useState<{ stripe: any[]; iap: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const [adjustUser, setAdjustUser] = useState<AdminUser | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('10');
  const [adjustReason, setAdjustReason] = useState('manual');
  const [adjusting, setAdjusting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'stats') {
        const s = await apiFetch('/admin/stats', {}, token);
        setStats(s);
      } else if (tab === 'users') {
        const u = await apiFetch('/admin/users?limit=100', {}, token);
        setUsers(u.items || []);
      } else if (tab === 'txns') {
        const t = await apiFetch('/admin/txns?limit=100', {}, token);
        setTxns(t.items || []);
      } else if (tab === 'payments') {
        const p = await apiFetch('/admin/payments', {}, token);
        setPayments(p);
      }
    } catch (e: any) {
      console.log(e);
    } finally {
      setLoading(false);
    }
  }, [tab, token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submitAdjust = async () => {
    if (!adjustUser) return;
    const delta = parseInt(adjustDelta, 10);
    if (isNaN(delta)) return;
    setAdjusting(true);
    try {
      await apiFetch(
        `/admin/users/${adjustUser.id}/credits`,
        { method: 'POST', body: JSON.stringify({ delta, reason: adjustReason }) },
        token,
      );
      setAdjustUser(null);
      setAdjustDelta('10');
      setAdjustReason('manual');
      // reload users
      const u = await apiFetch('/admin/users?limit=100', {}, token);
      setUsers(u.items || []);
    } catch (e: any) {
      console.log(e);
    } finally {
      setAdjusting(false);
    }
  };

  if (!user?.is_admin) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <Ionicons name="lock-closed" size={48} color={colors.error} />
          <Text style={styles.errTitle}>Bu ekrana erişim yetkin yok</Text>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Geri Dön</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable testID="admin-back" onPress={() => router.back()} hitSlop={12} style={styles.backIconBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>ADMIN PANEL</Text>
          <Text style={styles.title}>Yönetim</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
      >
        {[
          { k: 'stats' as const, label: 'İstatistik', icon: 'stats-chart' },
          { k: 'users' as const, label: 'Kullanıcılar', icon: 'people' },
          { k: 'txns' as const, label: 'Hareketler', icon: 'swap-horizontal' },
          { k: 'payments' as const, label: 'Ödemeler', icon: 'card' },
        ].map((t) => {
          const active = tab === t.k;
          return (
            <Pressable
              key={t.k}
              testID={`admin-tab-${t.k}`}
              onPress={() => setTab(t.k)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Ionicons name={t.icon as any} size={14} color={active ? colors.brand : colors.onSurfaceTertiary} />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}>
          {tab === 'stats' && stats && (
            <View style={{ gap: spacing.md }}>
              <StatGrid stats={stats} styles={styles} colors={colors} />
            </View>
          )}

          {tab === 'users' && (
            <View style={{ gap: spacing.sm }}>
              <Text style={styles.sectionLabel}>{users.length} KULLANICI</Text>
              {users.map((u) => (
                <View key={u.id} style={styles.userCard} testID={`admin-user-${u.id}`}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                      <Text style={styles.userEmail} numberOfLines={1}>{u.email}</Text>
                      {u.is_admin && (
                        <View style={styles.adminBadge}>
                          <Text style={styles.adminBadgeText}>ADMIN</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.userMeta}>
                      {u.query_credits} kredi · {u.report_count} rapor
                    </Text>
                  </View>
                  <Pressable
                    testID={`admin-user-adjust-${u.id}`}
                    onPress={() => setAdjustUser(u)}
                    style={styles.adjustBtn}
                  >
                    <Ionicons name="add-circle" size={16} color={colors.brand} />
                    <Text style={styles.adjustBtnText}>Kredi</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {tab === 'txns' && (
            <View style={{ gap: spacing.sm }}>
              <Text style={styles.sectionLabel}>SON {txns.length} HAREKET</Text>
              {txns.map((t) => (
                <View key={t.id} style={styles.txnCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txnReason}>{t.reason}</Text>
                    <Text style={styles.txnMeta} numberOfLines={1}>
                      {t.user_id.slice(0, 8)}… · {new Date(t.created_at).toLocaleString('tr-TR')}
                    </Text>
                  </View>
                  <Text style={[styles.txnDelta, { color: t.delta >= 0 ? colors.success : colors.error }]}>
                    {t.delta >= 0 ? '+' : ''}{t.delta}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {tab === 'payments' && payments && (
            <View style={{ gap: spacing.md }}>
              <View>
                <Text style={styles.sectionLabel}>STRIPE ({payments.stripe.length})</Text>
                {payments.stripe.length === 0 && <Text style={styles.emptyLine}>Kayıt yok</Text>}
                {payments.stripe.map((s: any, i: number) => (
                  <View key={i} style={styles.payCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.payTitle}>
                        {s.package_id} · {s.credits} kredi
                      </Text>
                      <Text style={styles.payMeta}>
                        ${(s.amount_cents / 100).toFixed(2)} · {s.fulfilled ? '✅ TAMAMLANDI' : '⏳ Bekliyor'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
              <View>
                <Text style={styles.sectionLabel}>IAP ({payments.iap.length})</Text>
                {payments.iap.length === 0 && <Text style={styles.emptyLine}>Kayıt yok</Text>}
                {payments.iap.map((s: any, i: number) => (
                  <View key={i} style={styles.payCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.payTitle}>{s.package_id} · {s.platform}</Text>
                      <Text style={styles.payMeta}>{new Date(s.created_at).toLocaleString('tr-TR')}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* Credit Adjust Modal */}
      <Modal visible={!!adjustUser} transparent animationType="slide" onRequestClose={() => setAdjustUser(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Kredi Ayarla</Text>
              <Pressable onPress={() => setAdjustUser(null)} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.onSurface} />
              </Pressable>
            </View>
            {adjustUser && (
              <>
                <Text style={styles.modalUser}>{adjustUser.email}</Text>
                <Text style={styles.modalMeta}>Mevcut: {adjustUser.query_credits} kredi</Text>
                <Text style={styles.inputLabel}>Değişim (+ eklemek / − çıkarmak)</Text>
                <TextInput
                  testID="adjust-delta"
                  style={styles.input}
                  value={adjustDelta}
                  onChangeText={setAdjustDelta}
                  keyboardType="numbers-and-punctuation"
                  placeholder="10 veya -5"
                  placeholderTextColor={colors.onSurfaceTertiary}
                />
                <Text style={styles.inputLabel}>Sebep</Text>
                <TextInput
                  testID="adjust-reason"
                  style={styles.input}
                  value={adjustReason}
                  onChangeText={setAdjustReason}
                  placeholder="örn: destek, promosyon, hediye"
                  placeholderTextColor={colors.onSurfaceTertiary}
                />
                <Pressable
                  testID="adjust-submit"
                  onPress={submitAdjust}
                  disabled={adjusting}
                  style={[styles.primaryBtn, adjusting && { opacity: 0.6 }]}
                >
                  {adjusting ? (
                    <ActivityIndicator color={colors.onBrandPrimary} />
                  ) : (
                    <Text style={styles.primaryBtnText}>Uygula</Text>
                  )}
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function StatGrid({ stats, styles, colors }: any) {
  const items = [
    { label: 'Kullanıcı', value: stats.total_users, icon: 'people' },
    { label: 'Toplam Analiz', value: stats.total_reports, icon: 'documents' },
    { label: '7 Gün Analiz', value: stats.week_analiz ?? stats.week_analyses, icon: 'trending-up' },
    { label: 'Sohbet Mesajı', value: stats.total_chats, icon: 'chatbubbles' },
    { label: 'Reklam Ödülü', value: stats.ad_rewards, icon: 'play-circle' },
    { label: 'Stripe Ödeme', value: stats.stripe_fulfilled_count, icon: 'card' },
    { label: 'IAP Ödeme', value: stats.iap_count, icon: 'logo-apple' },
    { label: 'Stripe Gelir', value: `$${stats.stripe_revenue_usd}`, icon: 'cash' },
  ];
  return (
    <View style={styles.grid}>
      {items.map((it, i) => (
        <View key={i} style={styles.statCard} testID={`stat-${it.label}`}>
          <Ionicons name={it.icon} size={22} color={colors.brandSecondary} />
          <Text style={styles.statValue}>{it.value}</Text>
          <Text style={styles.statLabel}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
    errTitle: { color: colors.onSurface, fontSize: 16, textAlign: 'center', fontFamily: fonts.regular },
    backBtn: { backgroundColor: colors.brand, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md },
    backBtnText: { color: colors.onBrandPrimary, fontFamily: fonts.semibold },
    header: { flexDirection: 'row', alignItems: 'center', padding: spacing.xl, paddingBottom: spacing.md, gap: spacing.md },
    backIconBtn: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
    eyebrow: { color: colors.brandSecondary, fontSize: 11, letterSpacing: 2, marginBottom: spacing.xs, fontFamily: fonts.medium },
    title: { color: colors.onSurface, fontSize: 24, fontFamily: fonts.semibold },
    tabsRow: { paddingHorizontal: spacing.xl, gap: spacing.sm, paddingBottom: spacing.md },
    tab: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, flexShrink: 0, height: 36 },
    tabActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
    tabText: { color: colors.onSurfaceTertiary, fontSize: 12, fontFamily: fonts.medium },
    tabTextActive: { color: colors.brand },
    sectionLabel: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1.6, marginBottom: spacing.sm, fontFamily: fonts.medium },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    statCard: {
      flexBasis: '47%',
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing.lg,
      gap: 4,
    },
    statValue: { color: colors.onSurface, fontSize: 26, marginTop: spacing.xs, fontFamily: fonts.semibold },
    statLabel: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1, fontFamily: fonts.medium },
    userCard: {
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    userEmail: { color: colors.onSurface, fontSize: 14, fontFamily: fonts.medium, flexShrink: 1 },
    userMeta: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2, fontFamily: fonts.regular },
    adminBadge: { backgroundColor: colors.brand, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill },
    adminBadgeText: { color: colors.onBrandPrimary, fontSize: 9, letterSpacing: 1, fontFamily: fonts.semibold },
    adjustBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.brandTertiary, borderColor: colors.brand, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
    adjustBtnText: { color: colors.brand, fontSize: 12, fontFamily: fonts.semibold },
    txnCard: {
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    txnReason: { color: colors.onSurface, fontSize: 13, fontFamily: fonts.medium },
    txnMeta: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2, fontFamily: fonts.regular },
    txnDelta: { fontSize: 16, fontFamily: fonts.semibold },
    payCard: {
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    payTitle: { color: colors.onSurface, fontSize: 14, fontFamily: fonts.medium },
    payMeta: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2, fontFamily: fonts.regular },
    emptyLine: { color: colors.onSurfaceTertiary, fontSize: 13, fontFamily: fonts.regular, fontStyle: 'italic' },
    modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, paddingBottom: spacing.xxxl, borderTopWidth: 1, borderColor: colors.border, gap: spacing.md },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    modalTitle: { color: colors.onSurface, fontSize: 18, fontFamily: fonts.semibold },
    modalUser: { color: colors.onSurface, fontSize: 14, fontFamily: fonts.medium },
    modalMeta: { color: colors.onSurfaceTertiary, fontSize: 12, fontFamily: fonts.regular },
    inputLabel: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1, fontFamily: fonts.medium, marginTop: spacing.sm },
    input: {
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: 12,
      color: colors.onSurface,
      fontSize: 14,
      fontFamily: fonts.regular,
    },
    primaryBtn: {
      backgroundColor: colors.brand,
      borderRadius: radius.md,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.sm,
    },
    primaryBtnText: { color: colors.onBrandPrimary, fontSize: 15, fontFamily: fonts.semibold },
  });
