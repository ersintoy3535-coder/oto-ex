import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { fonts, radius, spacing, ThemeColors, trafficColor, trafficLabel } from '@/src/theme/tokens';
import { shareReportAsPdf } from '@/src/utils/pdf';

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

type ChatMsg = { id: string; role: 'user' | 'assistant'; text: string; created_at: string };

const scoreColor = (colors: ThemeColors, s: number) =>
  s >= 70 ? colors.success : s >= 45 ? colors.warning : colors.error;

const fmtTL = (n: number) => new Intl.NumberFormat('tr-TR').format(Math.round(n)) + ' ₺';

const SUGGESTIONS = [
  'Bu araç LPG için uygun mu?',
  'Uzun yolda konforu nasıl?',
  'Yedek parça bulmak kolay mı?',
];

export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const { colors, themeName } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [isFav, setIsFav] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sharing, setSharing] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);

  const gradientBase = themeName === 'navy' ? '10,22,40' : '13,14,17';

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await apiFetch(`/reports/${id}`, {}, token);
      setReport(r);
      const [favIds, chat] = await Promise.all([
        apiFetch('/favorites/ids', {}, token),
        apiFetch(`/reports/${id}/chat`, {}, token).catch(() => ({ messages: [] })),
      ]);
      setIsFav((favIds.ids || []).includes(r.id));
      setChatMsgs((chat.messages || []) as ChatMsg[]);
    } catch (e: any) {
      setErr(e.message || 'Rapor yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => { load(); }, [load]);

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

  const share = async () => {
    if (!report || sharing) return;
    setSharing(true);
    try {
      await shareReportAsPdf(report);
    } catch (e: any) {
      console.log('share err', e);
    } finally {
      setSharing(false);
    }
  };

  const sendChat = async (text?: string) => {
    const message = (text ?? chatInput).trim();
    if (!message || !report || sending) return;
    setChatInput('');
    setSending(true);
    // optimistic append
    const optimistic: ChatMsg = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      text: message,
      created_at: new Date().toISOString(),
    };
    setChatMsgs((prev) => [...prev, optimistic]);
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 60);
    try {
      const res = await apiFetch(
        `/reports/${report.id}/chat`,
        { method: 'POST', body: JSON.stringify({ report_id: report.id, message }) },
        token,
      );
      setChatMsgs((prev) => {
        const withoutOptimistic = prev.filter((m) => m.id !== optimistic.id);
        return [...withoutOptimistic, res.user_msg as ChatMsg, res.reply as ChatMsg];
      });
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (e: any) {
      setChatMsgs((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
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
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.hero}>
          <Image source={{ uri: HERO }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
          <LinearGradient
            colors={[`rgba(${gradientBase},0.2)`, `rgba(${gradientBase},0.9)`, colors.surface]}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.heroTop}>
            <Pressable testID="close-report" onPress={() => router.back()} style={styles.iconBtn} hitSlop={12}>
              <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
            </Pressable>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable testID="share-pdf" onPress={share} style={styles.iconBtn} hitSlop={12} disabled={sharing}>
                {sharing ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <Ionicons name="share-outline" size={20} color={colors.onSurface} />
                )}
              </Pressable>
              <Pressable testID="toggle-fav" onPress={toggleFav} style={styles.iconBtn} hitSlop={12}>
                <Ionicons
                  name={isFav ? 'star' : 'star-outline'}
                  size={22}
                  color={isFav ? colors.brandSecondary : colors.onSurface}
                />
              </Pressable>
            </View>
          </View>
          <View style={styles.heroContent}>
            <Text style={styles.eyebrow}>EKSPERTİZ RAPORU</Text>
            <Text style={styles.title}>{report.marka} {report.model}</Text>
            <Text style={styles.yil}>{report.yil}{report.kilometre ? ` · ${report.kilometre.toLocaleString('tr-TR')} km` : ''}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={[styles.scoreCard, { borderColor: scoreColor(colors, report.guven_skoru) }]}>
            <Text style={styles.scoreLabel}>ARAÇ GÜVEN SKORU</Text>
            <Text style={[styles.scoreValue, { color: scoreColor(colors, report.guven_skoru) }]}>{report.guven_skoru}</Text>
            <Text style={styles.scoreMax}>/ 100</Text>
          </View>
          <Text style={styles.summary}>{report.ozet}</Text>
        </View>

        <View style={styles.section}>
          <View style={[styles.adviceCard, { borderLeftColor: scoreColor(colors, report.guven_skoru) }]}>
            <Text style={styles.adviceLabel}>AI TAVSİYESİ</Text>
            <Text style={styles.adviceText}>{report.alim_tavsiyesi}</Text>
          </View>
        </View>

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
          {!!report.fiyat_yorumu && (
            <View style={styles.priceCommentCard}>
              <Ionicons name="information-circle" size={18} color={colors.brandSecondary} />
              <Text style={styles.priceCommentText}>{report.fiyat_yorumu}</Text>
            </View>
          )}
        </View>

        {/* Fiyat-Performans Skoru */}
        {!!report.fiyat_performans_skoru && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>FİYAT-PERFORMANS SKORU</Text>
            <View style={[styles.scoreCard, { borderColor: scoreColor(colors, report.fiyat_performans_skoru) }]}>
              <Text style={styles.scoreLabel}>FİYAT-PERFORMANS</Text>
              <Text style={[styles.scoreValue, { color: scoreColor(colors, report.fiyat_performans_skoru) }]}>{report.fiyat_performans_skoru}</Text>
              <Text style={styles.scoreMax}>/ 100</Text>
            </View>
          </View>
        )}

        {/* Değer Kaybı */}
        {(report.deger_kaybi_tl || 0) > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>HASAR & DEĞER KAYBI</Text>
            <View style={styles.lossCard}>
              <View style={styles.lossRow}>
                <Text style={styles.lossLabel}>Değer Kaybı</Text>
                <Text style={styles.lossVal}>-{fmtTL(report.deger_kaybi_tl!)} · %{report.deger_kaybi_yuzde?.toFixed(1)}</Text>
              </View>
              <View style={[styles.lossRow, { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm, marginTop: spacing.sm }]}>
                <Text style={styles.lossLabel}>Nihai Piyasa Değeri</Text>
                <Text style={[styles.lossVal, { color: colors.brand }]}>{fmtTL(report.nihai_piyasa_degeri_tl || 0)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Güvenlik Uyarıları */}
        {report.guvenlik_uyarilari && report.guvenlik_uyarilari.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.error }]}>GÜVENLİK UYARILARI</Text>
            {report.guvenlik_uyarilari.map((w, i) => (
              <View key={i} style={styles.safetyCard} testID={`safety-${i}`}>
                <Ionicons name="warning" size={18} color={colors.error} />
                <Text style={styles.safetyText}>{w}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Kronik Kusurlar */}
        {report.kronik_kusurlar && report.kronik_kusurlar.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>KRONİK KUSURLAR</Text>
            {report.kronik_kusurlar.map((k, i) => (
              <View key={i} style={styles.noteRow}><Ionicons name="build" size={16} color={colors.warning} /><Text style={styles.noteText}>{k}</Text></View>
            ))}
          </View>
        )}

        {/* Kontrol Edilecek Parçalar */}
        {report.kontrol_edilecek_parcalar && report.kontrol_edilecek_parcalar.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>USTAYA GÖSTERİLECEK</Text>
            {report.kontrol_edilecek_parcalar.map((k, i) => (
              <View key={i} style={styles.noteRow}><Ionicons name="search" size={16} color={colors.brandSecondary} /><Text style={styles.noteText}>{k}</Text></View>
            ))}
          </View>
        )}

        {/* İç Yıpranma */}
        {report.ic_yipranma && report.ic_yipranma.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>İÇ YIPRANMA TAHMİNİ</Text>
            {report.ic_yipranma.map((w, i) => (
              <View key={i} style={styles.wearCard} testID={`wear-${i}`}>
                <View style={styles.wearTop}>
                  <Text style={styles.wearName}>{w.parca}</Text>
                  <Text style={styles.wearPct}>%{w.yuzde}</Text>
                </View>
                <View style={styles.wearBar}>
                  <View style={[styles.wearFill, { width: `${Math.min(100, Math.max(0, w.yuzde))}%`, backgroundColor: w.yuzde >= 70 ? colors.error : w.yuzde >= 40 ? colors.warning : colors.success }]} />
                </View>
                <Text style={styles.wearDesc}>{w.aciklama}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Renk Analizi */}
        {(report.renk_satis_hizi || report.renk_boya_hassasiyeti) && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>RENK ANALİZİ · {report.renk}</Text>
            {!!report.renk_satis_hizi && (
              <View style={styles.adviceCard}><Text style={styles.adviceLabel}>SATIŞ HIZI</Text><Text style={styles.adviceText}>{report.renk_satis_hizi}</Text></View>
            )}
            {!!report.renk_boya_hassasiyeti && (
              <View style={[styles.adviceCard, { marginTop: spacing.sm }]}><Text style={styles.adviceLabel}>BOYA HASSASİYETİ</Text><Text style={styles.adviceText}>{report.renk_boya_hassasiyeti}</Text></View>
            )}
          </View>
        )}

        {/* Pazarlık Taktikleri (buyer) */}
        {report.mod !== 'seller' && report.pazarlik_taktikleri && report.pazarlik_taktikleri.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>PAZARLIK EL KİTABI</Text>
            {report.pazarlik_taktikleri.map((p, i) => (
              <View key={i} style={styles.pazarlikCard}>
                <Text style={styles.pazarlikNum}>{i + 1}</Text>
                <Text style={styles.pazarlikText}>{p}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Satıcı İlan Metni (seller) */}
        {report.mod === 'seller' && !!report.satici_ilan_metni && (
          <View style={styles.section}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.sectionLabel}>İLAN METNİ</Text>
              <Pressable
                testID="copy-listing"
                onPress={() => { try { (globalThis as any).navigator?.clipboard?.writeText(report.satici_ilan_metni || ''); } catch {} }}
                style={styles.copyBtn}
              >
                <Ionicons name="copy" size={14} color={colors.brand} />
                <Text style={styles.copyBtnText}>Kopyala</Text>
              </Pressable>
            </View>
            <View style={styles.listingCard}>
              <Text style={styles.listingText}>{report.satici_ilan_metni}</Text>
            </View>
          </View>
        )}

        <IssueBlock title="MEKANİK SORUNLAR" items={report.mekanik_sorunlar} icon="cog" styles={styles} colors={colors} />
        <IssueBlock title="ELEKTRİK SORUNLARI" items={report.elektrik_sorunlar} icon="flash" styles={styles} colors={colors} />
        <IssueBlock title="KAPORTA & İÇ MEKAN" items={report.kaporta_ic_mekan} icon="car-sport" styles={styles} colors={colors} />
        <IssueBlock title="OLASI MASRAFLAR" items={report.olasi_masraflar} icon="wallet" styles={styles} colors={colors} />

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

      {/* Ask AI floating button */}
      {!chatOpen && (
        <Pressable
          testID="open-chat"
          onPress={() => setChatOpen(true)}
          style={styles.fab}
        >
          <Ionicons name="chatbubbles" size={20} color={colors.onBrandPrimary} />
          <Text style={styles.fabText}>AI'ya Sor</Text>
        </Pressable>
      )}

      {/* Chat panel */}
      {chatOpen && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.chatPanel}
        >
          <View style={styles.chatHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.chatTitle}>Bu araca özel sorular</Text>
              <Text style={styles.chatSub}>Gemini 2.5 Flash · anında cevap</Text>
            </View>
            <Pressable testID="close-chat" onPress={() => setChatOpen(false)} hitSlop={12} style={styles.chatCloseBtn}>
              <Ionicons name="close" size={22} color={colors.onSurface} />
            </Pressable>
          </View>

          <ScrollView
            ref={chatScrollRef}
            style={styles.chatMessages}
            contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
            onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}
          >
            {chatMsgs.length === 0 && (
              <View style={styles.suggestionWrap}>
                <Text style={styles.suggestionLabel}>ÖRNEK SORULAR</Text>
                {SUGGESTIONS.map((s, i) => (
                  <Pressable
                    key={i}
                    testID={`chat-suggest-${i}`}
                    style={styles.suggestionChip}
                    onPress={() => sendChat(s)}
                  >
                    <Ionicons name="sparkles" size={14} color={colors.brandSecondary} />
                    <Text style={styles.suggestionText}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {chatMsgs.map((m) => (
              <View key={m.id} style={[styles.msg, m.role === 'user' ? styles.msgUser : styles.msgAi]}>
                <Text style={m.role === 'user' ? styles.msgUserText : styles.msgAiText}>{m.text}</Text>
              </View>
            ))}
            {sending && (
              <View style={[styles.msg, styles.msgAi]}>
                <ActivityIndicator color={colors.brand} size="small" />
              </View>
            )}
          </ScrollView>

          <View style={styles.chatInputRow}>
            <TextInput
              testID="chat-input"
              placeholder="Bu araç hakkında bir şey sor…"
              placeholderTextColor={colors.onSurfaceTertiary}
              value={chatInput}
              onChangeText={setChatInput}
              style={styles.chatInput}
              editable={!sending}
              onSubmitEditing={() => sendChat()}
            />
            <Pressable
              testID="chat-send"
              onPress={() => sendChat()}
              disabled={!chatInput.trim() || sending}
              style={[styles.chatSendBtn, (!chatInput.trim() || sending) && { opacity: 0.4 }]}
            >
              <Ionicons name="send" size={18} color={colors.onBrandPrimary} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function IssueBlock({ title, items, icon, styles, colors }: any) {
  if (!items || items.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.blockHeader}>
        <Ionicons name={icon} size={16} color={colors.brandSecondary} />
        <Text style={styles.sectionLabel}>{title}</Text>
      </View>
      {items.map((it: Item, i: number) => (
        <View key={i} style={styles.issueCard} testID={`issue-${title}-${i}`}>
          <View style={styles.issueTop}>
            <Text style={styles.issueTitle}>{it.baslik}</Text>
            <View style={[styles.badge, { backgroundColor: trafficColor(colors, it.seviye) + '22', borderColor: trafficColor(colors, it.seviye) }]}>
              <Text style={[styles.badgeText, { color: trafficColor(colors, it.seviye) }]}>{trafficLabel(it.seviye)}</Text>
            </View>
          </View>
          <Text style={styles.issueDesc}>{it.aciklama}</Text>
        </View>
      ))}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
    loadingText: { color: colors.onSurfaceSecondary, marginTop: spacing.sm, fontFamily: fonts.regular },
    errTitle: { color: colors.onSurface, fontSize: 16, textAlign: 'center', fontFamily: fonts.regular },
    backBtn: { backgroundColor: colors.brand, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md },
    backBtnText: { color: colors.onBrandPrimary, fontFamily: fonts.semibold },
    hero: { height: 260, position: 'relative', justifyContent: 'flex-end' },
    heroTop: { position: 'absolute', top: spacing.md, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
    iconBtn: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
    heroContent: { padding: spacing.xl },
    eyebrow: { color: colors.brandSecondary, fontSize: 11, letterSpacing: 2, marginBottom: spacing.sm, fontFamily: fonts.medium },
    title: { color: colors.onSurface, fontSize: 28, fontFamily: fonts.semibold },
    yil: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 4, fontFamily: fonts.regular },
    section: { paddingHorizontal: spacing.xl, marginTop: spacing.lg },
    blockHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    sectionLabel: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1.6, fontFamily: fonts.medium },
    scoreCard: {
      backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 2, padding: spacing.xl,
      alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'center',
    },
    scoreLabel: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1.4, position: 'absolute', top: spacing.sm, alignSelf: 'center', fontFamily: fonts.medium },
    scoreValue: { fontSize: 64, lineHeight: 70, fontFamily: fonts.semibold },
    scoreMax: { color: colors.onSurfaceTertiary, fontSize: 20, marginTop: 24, fontFamily: fonts.regular },
    summary: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20, marginTop: spacing.md, fontFamily: fonts.regular },
    adviceCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderLeftWidth: 4, padding: spacing.lg, gap: spacing.xs },
    adviceLabel: { color: colors.brandSecondary, fontSize: 11, letterSpacing: 1.4, fontFamily: fonts.medium },
    adviceText: { color: colors.onSurface, fontSize: 15, lineHeight: 21, fontFamily: fonts.regular },
    statsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
    statCard: { flex: 1, backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.lg, gap: 4 },
    statLabel: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1, marginTop: spacing.xs, fontFamily: fonts.medium },
    statValue: { color: colors.onSurface, fontSize: 22, fontFamily: fonts.semibold },
    statSub: { color: colors.onSurfaceTertiary, fontSize: 11, fontFamily: fonts.regular },
    priceCommentCard: { marginTop: spacing.sm, flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.brandTertiary, padding: spacing.md, borderRadius: radius.md, alignItems: 'flex-start' },
    priceCommentText: { color: colors.onSurface, fontSize: 13, lineHeight: 18, flex: 1, fontFamily: fonts.regular },
    issueCard: { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.sm },
    issueTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs, gap: spacing.sm },
    issueTitle: { color: colors.onSurface, fontSize: 15, flex: 1, fontFamily: fonts.semibold },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1 },
    badgeText: { fontSize: 10, letterSpacing: 1, fontFamily: fonts.semibold },
    issueDesc: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular },
    maintCard: { flexDirection: 'row', backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, alignItems: 'center', gap: spacing.md },
    maintName: { color: colors.onSurface, fontSize: 14, fontFamily: fonts.semibold },
    maintPeriod: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2, fontFamily: fonts.regular },
    maintCost: { color: colors.brandSecondary, fontSize: 13, fontFamily: fonts.semibold },
    noteRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', marginBottom: spacing.xs, paddingRight: spacing.md },
    noteText: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19, flex: 1, fontFamily: fonts.regular },
    lossCard: { backgroundColor: colors.surfaceSecondary, borderColor: colors.error, borderWidth: 1, borderRadius: radius.md, padding: spacing.lg },
    lossRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    lossLabel: { color: colors.onSurfaceTertiary, fontSize: 12, letterSpacing: 1, fontFamily: fonts.medium },
    lossVal: { color: colors.error, fontSize: 18, fontFamily: fonts.semibold },
    safetyCard: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderLeftWidth: 4, borderLeftColor: colors.error, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm, alignItems: 'flex-start' },
    safetyText: { color: colors.onSurface, fontSize: 13, lineHeight: 19, flex: 1, fontFamily: fonts.medium },
    wearCard: { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, gap: 6 },
    wearTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    wearName: { color: colors.onSurface, fontSize: 14, fontFamily: fonts.semibold, flex: 1 },
    wearPct: { color: colors.brand, fontSize: 14, fontFamily: fonts.semibold },
    wearBar: { height: 6, backgroundColor: colors.divider, borderRadius: 3, overflow: 'hidden' },
    wearFill: { height: '100%', borderRadius: 3 },
    wearDesc: { color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 17, fontFamily: fonts.regular },
    pazarlikCard: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
    pazarlikNum: { color: colors.brand, fontSize: 16, fontFamily: fonts.semibold, minWidth: 22 },
    pazarlikText: { color: colors.onSurface, fontSize: 13, lineHeight: 19, flex: 1, fontFamily: fonts.regular },
    listingCard: { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.lg },
    listingText: { color: colors.onSurface, fontSize: 13, lineHeight: 20, fontFamily: fonts.regular },
    copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.brandTertiary, borderColor: colors.brand, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
    copyBtnText: { color: colors.brand, fontSize: 11, fontFamily: fonts.semibold },
    fab: {
      position: 'absolute',
      right: spacing.xl,
      bottom: spacing.xl,
      backgroundColor: colors.brand,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.pill,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
    },
    fabText: { color: colors.onBrandPrimary, fontSize: 14, fontFamily: fonts.semibold },
    chatPanel: {
      position: 'absolute',
      left: 0, right: 0, bottom: 0,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderColor: colors.border,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      height: '75%',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
      elevation: 20,
    },
    chatHeader: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderColor: colors.border, gap: spacing.md },
    chatTitle: { color: colors.onSurface, fontSize: 15, fontFamily: fonts.semibold },
    chatSub: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2, fontFamily: fonts.regular },
    chatCloseBtn: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
    chatMessages: { flex: 1 },
    suggestionWrap: { gap: spacing.sm },
    suggestionLabel: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1.4, marginBottom: spacing.xs, fontFamily: fonts.medium },
    suggestionChip: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border, borderWidth: 1, borderRadius: radius.pill,
      paddingHorizontal: spacing.md, paddingVertical: 10,
    },
    suggestionText: { color: colors.onSurface, fontSize: 13, fontFamily: fonts.regular },
    msg: { maxWidth: '85%', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md },
    msgUser: { backgroundColor: colors.brand, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
    msgUserText: { color: colors.onBrandPrimary, fontSize: 14, lineHeight: 19, fontFamily: fonts.regular },
    msgAi: { backgroundColor: colors.surfaceSecondary, alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
    msgAiText: { color: colors.onSurface, fontSize: 14, lineHeight: 19, fontFamily: fonts.regular },
    chatInputRow: { flexDirection: 'row', padding: spacing.md, gap: spacing.sm, borderTopWidth: 1, borderColor: colors.border, alignItems: 'center' },
    chatInput: {
      flex: 1,
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border, borderWidth: 1,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.lg, paddingVertical: 12,
      color: colors.onSurface, fontSize: 14, fontFamily: fonts.regular,
    },
    chatSendBtn: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  });
