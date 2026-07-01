import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiFetch, useAuth } from '@/src/auth/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { fonts, radius, spacing, ThemeColors } from '@/src/theme/tokens';

type Pkg = { id: string; credits: number; price_usd_cents: number; label: string };

// Generate a simple random session id (no external dep).
const genSessionId = () =>
  `ad-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const priceStr = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
const perCredit = (cents: number, credits: number) =>
  `$${(cents / 100 / credits).toFixed(2)} / sorgu`;

export default function CreditsScreen() {
  const { token } = useAuth();
  const { colors, themeName } = useTheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [credits, setCredits] = useState<number>(0);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [loading, setLoading] = useState(true);
  const [adBusy, setAdBusy] = useState(false);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, p] = await Promise.all([
        apiFetch('/credits/me', {}, token),
        apiFetch('/credits/packages', {}, token),
      ]);
      setCredits(c.credits ?? 0);
      setPackages(p.packages || []);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const watchAd = async () => {
    setMsg(null);
    setErr(null);
    setAdBusy(true);
    try {
      // MOCK ad view — a real AdMob rewarded ad is shown only on a native dev/prod
      // build. Swap this block with react-native-google-mobile-ads onEarnedReward.
      // See /app/frontend/docs/native-integrations.md
      await new Promise((r) => setTimeout(r, 1400));
      const ad_session_id = genSessionId();
      const res = await apiFetch(
        '/credits/reward-ad',
        { method: 'POST', body: JSON.stringify({ ad_session_id }) },
        token,
      );
      setCredits(res.balance ?? credits + 1);
      setMsg('🎁 +1 sorgu kazandın!');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setAdBusy(false);
    }
  };

  const buyStripe = async (pkg: Pkg) => {
    setMsg(null);
    setErr(null);
    setBuyingId(pkg.id);
    try {
      const origin =
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? window.location.origin
          : process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const { url, session_id } = await apiFetch(
        '/checkout/create',
        { method: 'POST', body: JSON.stringify({ package_id: pkg.id, origin_url: origin }) },
        token,
      );
      const result = await WebBrowser.openAuthSessionAsync(
        url,
        `${origin}/checkout/return`,
      );
      // After browser closes, poll status
      if (result.type === 'success' || result.type === 'dismiss' || result.type === 'cancel') {
        const s = await apiFetch(`/checkout/status/${session_id}`, {}, token);
        if (s.paid) {
          setCredits(s.balance ?? credits);
          setMsg(`✅ Ödeme başarılı! +${s.credited_now} sorgu eklendi.`);
        } else {
          setMsg('Ödeme tamamlanmadı.');
        }
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBuyingId(null);
    }
  };

  const buyIAP = async (pkg: Pkg) => {
    setMsg(null);
    setErr(null);
    setBuyingId(`iap-${pkg.id}`);
    try {
      // MOCK IAP purchase — in a native dev/prod build, swap with expo-iap or
      // react-native-iap: requestPurchase -> onPurchaseUpdated -> send receipt.
      // See /app/frontend/docs/native-integrations.md
      const receipt = `mock-iap-${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const platform = Platform.OS === 'ios' ? 'ios' : 'android';
      const res = await apiFetch(
        '/iap/verify',
        { method: 'POST', body: JSON.stringify({ package_id: pkg.id, platform, receipt }) },
        token,
      );
      setCredits(res.balance ?? credits);
      setMsg(`📱 IAP başarılı! +${res.credited} sorgu eklendi.`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBuyingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable testID="close-credits" onPress={() => router.back()} hitSlop={12} style={styles.closeBtn}>
          <Ionicons name="close" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        <View style={styles.hero}>
          <LinearGradient
            colors={[colors.brandTertiary, colors.surface]}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.balanceRow}>
            <Ionicons name="flash" size={24} color={colors.brand} />
            <Text style={styles.balanceLabel}>MEVCUT BAKİYE</Text>
          </View>
          <Text style={styles.balanceValue} testID="credits-balance">{credits}</Text>
          <Text style={styles.balanceSub}>sorgu hakkı</Text>
        </View>

        {msg && <Text style={styles.msgOk} testID="msg-ok">{msg}</Text>}
        {err && <Text style={styles.msgErr} testID="msg-err">{err}</Text>}

        {/* Rewarded Ad */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ÜCRETSİZ SORGU KAZAN</Text>
          <Pressable
            testID="watch-ad-btn"
            onPress={watchAd}
            disabled={adBusy}
            style={({ pressed }) => [styles.adCard, pressed && { opacity: 0.75 }]}
          >
            <View style={styles.adIconWrap}>
              <Ionicons name="play-circle" size={32} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.adTitle}>Reklam İzle · +1 Sorgu</Text>
              <Text style={styles.adSub}>Kısa bir reklam izle, hemen 1 sorgu kazan.</Text>
            </View>
            {adBusy ? (
              <ActivityIndicator color={colors.brand} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
            )}
          </Pressable>
          <Text style={styles.footnote}>
            Native build üzerinde gerçek Google AdMob ödüllü reklam çalışır.
          </Text>
        </View>

        {/* Packages */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SORGU PAKETİ SATIN AL</Text>
          {loading ? (
            <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.md }} />
          ) : (
            packages.map((pkg, i) => {
              const highlighted = pkg.id === 'medium';
              return (
                <View key={pkg.id} style={[styles.pkgCard, highlighted && styles.pkgHighlight]}>
                  {highlighted && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>EN POPÜLER</Text>
                    </View>
                  )}
                  <View style={styles.pkgTop}>
                    <View>
                      <Text style={styles.pkgLabel}>{pkg.label}</Text>
                      <Text style={styles.pkgPerCredit}>{perCredit(pkg.price_usd_cents, pkg.credits)}</Text>
                    </View>
                    <Text style={styles.pkgPrice}>{priceStr(pkg.price_usd_cents)}</Text>
                  </View>
                  <View style={styles.pkgBtns}>
                    <Pressable
                      testID={`stripe-${pkg.id}`}
                      onPress={() => buyStripe(pkg)}
                      disabled={!!buyingId}
                      style={({ pressed }) => [styles.stripeBtn, pressed && { opacity: 0.75 }, buyingId && !buyingId.startsWith('iap') && { opacity: 0.5 }]}
                    >
                      {buyingId === pkg.id ? (
                        <ActivityIndicator color={colors.onBrandPrimary} size="small" />
                      ) : (
                        <>
                          <Ionicons name="card" size={16} color={colors.onBrandPrimary} />
                          <Text style={styles.stripeBtnText}>Kart ile</Text>
                        </>
                      )}
                    </Pressable>
                    <Pressable
                      testID={`iap-${pkg.id}`}
                      onPress={() => buyIAP(pkg)}
                      disabled={!!buyingId}
                      style={({ pressed }) => [styles.iapBtn, pressed && { opacity: 0.75 }]}
                    >
                      {buyingId === `iap-${pkg.id}` ? (
                        <ActivityIndicator color={colors.brand} size="small" />
                      ) : (
                        <>
                          <Ionicons name={Platform.OS === 'ios' ? 'logo-apple' : 'logo-google-playstore'} size={16} color={colors.brand} />
                          <Text style={styles.iapBtnText}>{Platform.OS === 'ios' ? 'App Store' : 'Play Store'}</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
          <Text style={styles.footnote}>
            Native build üzerinde App Store / Play Store gerçek IAP çalışır. Şu an mock modunda.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    header: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
    closeBtn: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
    hero: {
      paddingVertical: spacing.xxxl,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.md,
    },
    balanceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    balanceLabel: { color: colors.brandSecondary, fontSize: 11, letterSpacing: 2, fontFamily: fonts.medium },
    balanceValue: { color: colors.brand, fontSize: 84, lineHeight: 90, fontFamily: fonts.semibold },
    balanceSub: { color: colors.onSurfaceSecondary, fontSize: 13, fontFamily: fonts.regular },
    msgOk: { color: colors.success, fontSize: 13, textAlign: 'center', marginBottom: spacing.md, paddingHorizontal: spacing.xl, fontFamily: fonts.medium },
    msgErr: { color: colors.error, fontSize: 13, textAlign: 'center', marginBottom: spacing.md, paddingHorizontal: spacing.xl, fontFamily: fonts.regular },
    section: { paddingHorizontal: spacing.xl, marginTop: spacing.xl },
    sectionLabel: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1.6, marginBottom: spacing.md, fontFamily: fonts.medium },
    adCard: {
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.brand,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    adIconWrap: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
    adTitle: { color: colors.onSurface, fontSize: 15, fontFamily: fonts.semibold },
    adSub: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2, fontFamily: fonts.regular },
    footnote: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: spacing.sm, lineHeight: 15, fontFamily: fonts.regular },
    pkgCard: {
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    pkgHighlight: { borderColor: colors.brand, borderWidth: 2 },
    badge: {
      position: 'absolute',
      top: -10,
      right: spacing.lg,
      backgroundColor: colors.brand,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radius.pill,
    },
    badgeText: { color: colors.onBrandPrimary, fontSize: 9, letterSpacing: 1.2, fontFamily: fonts.semibold },
    pkgTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: spacing.md },
    pkgLabel: { color: colors.onSurface, fontSize: 20, fontFamily: fonts.semibold },
    pkgPerCredit: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2, fontFamily: fonts.regular },
    pkgPrice: { color: colors.brand, fontSize: 28, fontFamily: fonts.semibold },
    pkgBtns: { flexDirection: 'row', gap: spacing.sm },
    stripeBtn: {
      flex: 1,
      backgroundColor: colors.brand,
      borderRadius: radius.md,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
    },
    stripeBtnText: { color: colors.onBrandPrimary, fontSize: 13, fontFamily: fonts.semibold },
    iapBtn: {
      flex: 1,
      backgroundColor: colors.surfaceTertiary,
      borderColor: colors.brand,
      borderWidth: 1,
      borderRadius: radius.md,
      paddingVertical: 11,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
    },
    iapBtnText: { color: colors.brand, fontSize: 13, fontFamily: fonts.semibold },
  });
