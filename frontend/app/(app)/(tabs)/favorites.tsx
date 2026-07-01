import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiFetch, useAuth } from '@/src/auth/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { fonts, radius, spacing, ThemeColors } from '@/src/theme/tokens';

type Report = { id: string; marka: string; model: string; yil: number; guven_skoru: number };

const scoreColor = (colors: ThemeColors, s: number) =>
  s >= 70 ? colors.success : s >= 45 ? colors.warning : colors.error;

export default function FavoritesScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const [favs, setFavs] = useState<Report[]>([]);
  const [history, setHistory] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'fav' | 'hist'>('fav');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [f, h] = await Promise.all([
        apiFetch('/favorites', {}, token),
        apiFetch('/history', {}, token),
      ]);
      setFavs(f);
      setHistory(h);
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const data = tab === 'fav' ? favs : history;

  const renderItem = ({ item, index }: { item: Report; index: number }) => (
    <Pressable
      testID={`fav-item-${index}`}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
      onPress={() => router.push({ pathname: '/(app)/report/[id]', params: { id: item.id } })}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.marka}>{item.marka} {item.model}</Text>
        <Text style={styles.yil}>{item.yil}</Text>
      </View>
      <View style={[styles.scoreBadge, { borderColor: scoreColor(colors, item.guven_skoru) }]}>
        <Text style={[styles.scoreValue, { color: scoreColor(colors, item.guven_skoru) }]}>{item.guven_skoru}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>ARŞİV</Text>
        <Text style={styles.title}>{tab === 'fav' ? 'Favorilerim' : 'Geçmiş Analizler'}</Text>
      </View>

      <View style={styles.tabs}>
        <Pressable
          testID="tab-fav"
          onPress={() => setTab('fav')}
          style={[styles.tab, tab === 'fav' && styles.tabActive]}
        >
          <Ionicons name="star" size={16} color={tab === 'fav' ? colors.brand : colors.onSurfaceTertiary} />
          <Text style={[styles.tabText, tab === 'fav' && styles.tabTextActive]}>Favoriler ({favs.length})</Text>
        </Pressable>
        <Pressable
          testID="tab-hist"
          onPress={() => setTab('hist')}
          style={[styles.tab, tab === 'hist' && styles.tabActive]}
        >
          <Ionicons name="time" size={16} color={tab === 'hist' ? colors.brand : colors.onSurfaceTertiary} />
          <Text style={[styles.tabText, tab === 'hist' && styles.tabTextActive]}>Geçmiş ({history.length})</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : data.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name={tab === 'fav' ? 'star-outline' : 'time-outline'} size={54} color={colors.onSurfaceTertiary} />
          <Text style={styles.emptyTitle}>
            {tab === 'fav' ? 'Henüz favori yok' : 'Henüz analiz yok'}
          </Text>
          <Text style={styles.emptySub}>
            Ana sayfadan bir araç analiz et, favorilerine ekle.
          </Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    header: { padding: spacing.xl, paddingBottom: spacing.md },
    eyebrow: { color: colors.brandSecondary, fontSize: 11, letterSpacing: 2, marginBottom: spacing.xs, fontFamily: fonts.medium },
    title: { color: colors.onSurface, fontSize: 28, fontFamily: fonts.semibold },
    tabs: { flexDirection: 'row', paddingHorizontal: spacing.xl, gap: spacing.sm, marginBottom: spacing.md },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
    tabText: { color: colors.onSurfaceTertiary, fontSize: 13, fontFamily: fonts.regular },
    tabTextActive: { color: colors.brand, fontFamily: fonts.semibold },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
    emptyTitle: { color: colors.onSurface, fontSize: 16, fontFamily: fonts.semibold },
    emptySub: { color: colors.onSurfaceTertiary, fontSize: 13, textAlign: 'center', fontFamily: fonts.regular },
    card: {
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    marka: { color: colors.onSurface, fontSize: 15, fontFamily: fonts.semibold },
    yil: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2, fontFamily: fonts.regular },
    scoreBadge: {
      width: 46,
      height: 46,
      borderRadius: radius.pill,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scoreValue: { fontSize: 16, fontFamily: fonts.semibold },
  });
