import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiFetch, useAuth } from '@/src/auth/AuthContext';
import { colors, radius, spacing, trafficColor, trafficLabel } from '@/src/theme/tokens';

const HERO = 'https://images.unsplash.com/photo-1558678542-d52f29185251?crop=entropy&cs=srgb&fm=jpg&q=85&w=940';

type Item = { baslik: string; aciklama: string; seviye: string };
type MItem = { isim: string; periyot: string; tahmini_maliyet_tl: string };
type Report = {
  id: string;
  marka: string;
  model: string;
  yil: number;
  kilometre?: number;
  istenilen_fiyat?: number;
  guven_skoru: number;
  ozet: string;
  fiyat_min_tl: number;
  fiyat_max_tl: number;
  fiyat_yorumu: string;
  yakit_100km_litre: number;
  aylik_yakit_tahmini_tl: number;
  mekanik_sorunlar: Item[];
  elektrik_sorunlar: Item[];
  kaporta_ic_mekan: Item[];
  periyodik_bakim: MItem[];
  olasi_masraflar: Item[];
  alim_tavsiyesi: string;
  dikkat_edilecek_noktalar: string[];
};

const scoreColor = (s: number) => (s >= 70 ? colors.success : s >= 45 ? colors.warning : colors.error);

const fmtTL = (n: number) => new Intl.NumberFormat('tr-TR').format(Math.round(n)) + ' ₺';

export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [isFav, setIsFav] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await apiFetch(`/reports/${id}`, {}, token);
      setReport(r);
      const favIds = await apiFetch('/favorites/ids', {}, token);
      setIsFav((favIds.ids || []).includes(r.id));
    } catch (e: any) {
      setErr(e.message || 'Rapor yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFav = async () => {
    if (!report) return;
    try {
      if (isFav) {
        await apiFetch(`/favorites/${report.id}`, { method: 'DELETE' }, token);
        setIsFav(false);
      } else {
        await apiFetch(`/favorites/${report.id}`, { method: 'POST' }, token);
        setIsFav(true);
      }
    } catch {}
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} size="large" />
          <Text style={styles.loadingText}>Rapor yükleniyor…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (err || !report) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Ionicons name="alert-circle" size={48} color={colors.error} />
          <Text style={styles.errTitle}>{err || 'Rapor bulunamadı'}</Text>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Geri Dön</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        <View style={styles.hero}>
          <Image source={{ uri: HERO }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
          <LinearGradient
            colors={['rgba(13,14,17,0.2)', 'rgba(13,14,17,0.9)', colors.surface]}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.heroTop}>
            <Pressable testID="close-report" onPress={() => router.back()} style={styles.iconBtn} hitSlop={12}>
              <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
            </Pressable>
            <Pressable testID="toggle-fav" onPress={toggleFav} style={styles.iconBtn} hitSlop={12}>
              <Ionicons
                name={isFav ? 'star' : 'star-outline'}
                size={22}
                color={isFav ? colors.brandSecondary : colors.onSurface}
              />
            </Pressable>
          </View>
          <View style={styles.heroContent}>
            <Text style={styles.eyebrow}>EKSPERTİZ RAPORU</Text>
            <Text style={styles.title}>{report.marka} {report.model}</Text>
            <Text style={styles.yil}>{report.yil}{report.kilometre ? ` · ${report.kilometre.toLocaleString('tr-TR')} km` : ''}</Text>
          </View>
        </View>

        {/* Score */}
        <View style={styles.section}>
          <View style={[styles.scoreCard, { borderColor: scoreColor(report.guven_skoru) }]}>
            <Text style={styles.scoreLabel}>ARAÇ GÜVEN SKORU</Text>
            <Text style={[styles.scoreValue, { color: scoreColor(report.guven_skoru) }]}>{report.guven_skoru}</Text>
            <Text style={styles.scoreMax}>/ 100</Text>
          </View>
          <Text style={styles.summary}>{report.ozet}</Text>
        </View>

        {/* Advice */}
        <View style={styles.section}>
          <View style={[styles.adviceCard, { borderLeftColor: scoreColor(report.guven_skoru) }]}>
            <Text style={styles.adviceLabel}>AI TAVSİYESİ</Text>
            <Text style={styles.adviceText}>{report.alim_tavsiyesi}</Text>
          </View>
        </View>

        {/* Price & Fuel Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PİYASA & YAKIT</Text>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Ionicons name="pricetag" size={18} color={colors.brandSecondary} />
              <Text style={styles.statLabel}>Piyasa Fiyatı</Text>
              <Text style={styles.statValue}>{fmtTL(report.fiyat_min_tl)}</Text>
              <Text style={styles.statSub}>~ {fmtTL(report.fiyat_max_tl)}</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="water" size={18} color={colors.brandSecondary} />
              <Text style={styles.statLabel}>100km Yakıt</Text>
              <Text style={styles.statValue}>{report.yakit_100km_litre.toFixed(1)} L</Text>
              <Text style={styles.statSub}>Aylık ~ {fmtTL(report.aylik_yakit_tahmini_tl)}</Text>
            </View>
          </View>
          {report.fiyat_yorumu && (
            <View style={styles.priceCommentCard}>
              <Ionicons name="information-circle" size={18} color={colors.brandSecondary} />
              <Text style={styles.priceCommentText}>{report.fiyat_yorumu}</Text>
            </View>
          )}
        </View>

        <IssueBlock title="MEKANİK SORUNLAR" items={report.mekanik_sorunlar} icon="cog" />
        <IssueBlock title="ELEKTRİK SORUNLARI" items={report.elektrik_sorunlar} icon="flash" />
        <IssueBlock title="KAPORTA & İÇ MEKAN" items={report.kaporta_ic_mekan} icon="car-sport" />
        <IssueBlock title="OLASI MASRAFLAR" items={report.olasi_masraflar} icon="wallet" />

        {/* Maintenance */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PERİYODİK BAKIM</Text>
          {report.periyodik_bakim.map((m, i) => (
            <View key={i} style={styles.maintCard} testID={`maint-${i}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.maintName}>{m.isim}</Text>
                <Text style={styles.maintPeriod}>{m.periyot}</Text>
              </View>
              <Text style={styles.maintCost}>{m.tahmini_maliyet_tl}</Text>
            </View>
          ))}
        </View>

        {/* Notes */}
        {report.dikkat_edilecek_noktalar.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>DİKKAT EDİLECEK NOKTALAR</Text>
            {report.dikkat_edilecek_noktalar.map((n, i) => (
              <View key={i} style={styles.noteRow}>
                <Ionicons name="checkmark-circle" size={16} color={colors.brandSecondary} />
                <Text style={styles.noteText}>{n}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function IssueBlock({ title, items, icon }: { title: string; items: Item[]; icon: any }) {
  if (!items || items.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.blockHeader}>
        <Ionicons name={icon} size={16} color={colors.brandSecondary} />
        <Text style={styles.sectionLabel}>{title}</Text>
      </View>
      {items.map((it, i) => (
        <View key={i} style={styles.issueCard} testID={`issue-${title}-${i}`}>
          <View style={styles.issueTop}>
            <Text style={styles.issueTitle}>{it.baslik}</Text>
            <View style={[styles.badge, { backgroundColor: trafficColor(it.seviye) + '22', borderColor: trafficColor(it.seviye) }]}>
              <Text style={[styles.badgeText, { color: trafficColor(it.seviye) }]}>{trafficLabel(it.seviye)}</Text>
            </View>
          </View>
          <Text style={styles.issueDesc}>{it.aciklama}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  loadingText: { color: colors.onSurfaceSecondary, marginTop: spacing.sm },
  errTitle: { color: colors.onSurface, fontSize: 16, textAlign: 'center' },
  backBtn: { backgroundColor: colors.brand, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md },
  backBtnText: { color: colors.onBrandPrimary, fontWeight: '500' },
  hero: { height: 260, position: 'relative', justifyContent: 'flex-end' },
  heroTop: { position: 'absolute', top: spacing.md, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  iconBtn: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: 'rgba(13,14,17,0.6)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  heroContent: { padding: spacing.xl },
  eyebrow: { color: colors.brandSecondary, fontSize: 11, letterSpacing: 2, marginBottom: spacing.sm, fontWeight: '500' },
  title: { color: colors.onSurface, fontSize: 30, fontWeight: '500' },
  yil: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 4 },
  section: { paddingHorizontal: spacing.xl, marginTop: spacing.lg },
  blockHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  sectionLabel: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1.6, fontWeight: '500' },
  scoreCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 2,
    padding: spacing.xl,
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'center',
  },
  scoreLabel: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1.4, position: 'absolute', top: spacing.sm, alignSelf: 'center', fontWeight: '500' },
  scoreValue: { fontSize: 68, fontWeight: '500', lineHeight: 72 },
  scoreMax: { color: colors.onSurfaceTertiary, fontSize: 20, marginTop: 24 },
  summary: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20, marginTop: spacing.md },
  adviceCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  adviceLabel: { color: colors.brandSecondary, fontSize: 11, letterSpacing: 1.4, fontWeight: '500' },
  adviceText: { color: colors.onSurface, fontSize: 15, lineHeight: 21 },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  statCard: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: 4,
  },
  statLabel: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1, marginTop: spacing.xs, fontWeight: '500' },
  statValue: { color: colors.onSurface, fontSize: 22, fontWeight: '500' },
  statSub: { color: colors.onSurfaceTertiary, fontSize: 11 },
  priceCommentCard: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.brandTertiary,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'flex-start',
  },
  priceCommentText: { color: colors.onSurface, fontSize: 13, lineHeight: 18, flex: 1 },
  issueCard: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  issueTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs, gap: spacing.sm },
  issueTitle: { color: colors.onSurface, fontSize: 15, fontWeight: '500', flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1 },
  badgeText: { fontSize: 10, letterSpacing: 1, fontWeight: '500' },
  issueDesc: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19 },
  maintCard: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    alignItems: 'center',
    gap: spacing.md,
  },
  maintName: { color: colors.onSurface, fontSize: 14, fontWeight: '500' },
  maintPeriod: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  maintCost: { color: colors.brandSecondary, fontSize: 13, fontWeight: '500' },
  noteRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', marginBottom: spacing.xs, paddingRight: spacing.md },
  noteText: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19, flex: 1 },
});
