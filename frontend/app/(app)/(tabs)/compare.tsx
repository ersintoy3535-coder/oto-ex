import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiFetch, useAuth } from '@/src/auth/AuthContext';
import { colors, radius, spacing } from '@/src/theme/tokens';

type Report = { id: string; marka: string; model: string; yil: number; guven_skoru: number };

type CompareResult = {
  car1: any;
  car2: any;
  winners: { [k: string]: 'car1' | 'car2' | 'tie' };
};

const fmtTL = (n: number) => new Intl.NumberFormat('tr-TR').format(Math.round(n)) + ' ₺';
const scoreColor = (s: number) => (s >= 70 ? colors.success : s >= 45 ? colors.warning : colors.error);

export default function CompareScreen() {
  const { token } = useAuth();
  const [history, setHistory] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [pick1, setPick1] = useState<Report | null>(null);
  const [pick2, setPick2] = useState<Report | null>(null);
  const [pickerFor, setPickerFor] = useState<null | 1 | 2>(null);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [comparing, setComparing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const h = await apiFetch('/history', {}, token);
      setHistory(h);
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const runCompare = async () => {
    if (!pick1 || !pick2) return;
    setComparing(true);
    setErr(null);
    setResult(null);
    try {
      const r = await apiFetch('/compare', {
        method: 'POST',
        body: JSON.stringify({ car1_id: pick1.id, car2_id: pick2.id }),
      }, token);
      setResult(r);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setComparing(false);
    }
  };

  const openPicker = (which: 1 | 2) => {
    if (history.length === 0) {
      setErr('Karşılaştırmak için önce en az 2 araç analizi yapmalısın.');
      return;
    }
    setErr(null);
    setPickerFor(which);
  };

  const pick = (r: Report) => {
    if (pickerFor === 1) setPick1(r);
    if (pickerFor === 2) setPick2(r);
    setPickerFor(null);
    setResult(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>YAN YANA</Text>
          <Text style={styles.title}>Karşılaştırma</Text>
          <Text style={styles.sub}>Geçmiş analizlerden iki araç seç, yan yana kıyasla.</Text>
        </View>

        <View style={styles.pickerRow}>
          <PickerCard label="1. ARAÇ" pick={pick1} onPress={() => openPicker(1)} testID="pick-1" />
          <View style={styles.vs}><Text style={styles.vsText}>VS</Text></View>
          <PickerCard label="2. ARAÇ" pick={pick2} onPress={() => openPicker(2)} testID="pick-2" />
        </View>

        {err && <Text style={styles.errText}>{err}</Text>}

        <Pressable
          testID="run-compare"
          disabled={!pick1 || !pick2 || comparing}
          onPress={runCompare}
          style={({ pressed }) => [styles.primaryBtn, (!pick1 || !pick2 || comparing) && { opacity: 0.5 }, pressed && { opacity: 0.7 }]}
        >
          {comparing ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <>
              <Ionicons name="git-compare" size={20} color={colors.onBrandPrimary} />
              <Text style={styles.primaryBtnText}>Karşılaştır</Text>
            </>
          )}
        </Pressable>

        {result && <ResultView r={result} />}

        {loading && (
          <View style={{ padding: spacing.xl }}>
            <ActivityIndicator color={colors.brand} />
          </View>
        )}
      </ScrollView>

      <Modal visible={pickerFor !== null} animationType="slide" transparent onRequestClose={() => setPickerFor(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Araç Seç</Text>
              <Pressable onPress={() => setPickerFor(null)} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.onSurface} />
              </Pressable>
            </View>
            <ScrollView>
              {history.map((r) => (
                <Pressable key={r.id} style={styles.modalItem} onPress={() => pick(r)} testID={`modal-pick-${r.id}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.marka}>{r.marka} {r.model}</Text>
                    <Text style={styles.yil}>{r.yil}</Text>
                  </View>
                  <View style={[styles.scoreBadge, { borderColor: scoreColor(r.guven_skoru) }]}>
                    <Text style={[styles.scoreValue, { color: scoreColor(r.guven_skoru) }]}>{r.guven_skoru}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function PickerCard({ label, pick, onPress, testID }: { label: string; pick: Report | null; onPress: () => void; testID: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={styles.pickCard}>
      <Text style={styles.pickLabel}>{label}</Text>
      {pick ? (
        <>
          <Text style={styles.pickMarka} numberOfLines={1}>{pick.marka}</Text>
          <Text style={styles.pickModel} numberOfLines={1}>{pick.model}</Text>
          <Text style={styles.pickYil}>{pick.yil}</Text>
        </>
      ) : (
        <>
          <Ionicons name="add-circle-outline" size={36} color={colors.brand} />
          <Text style={styles.pickPlaceholder}>Araç seç</Text>
        </>
      )}
    </Pressable>
  );
}

function ResultView({ r }: { r: CompareResult }) {
  const Row = ({ label, key1, value1, value2, winnerKey, formatter }: any) => {
    const w = r.winners[winnerKey];
    return (
      <View style={styles.compareRow}>
        <View style={[styles.compareCell, w === 'car1' && styles.winnerCell]}>
          <Text style={[styles.compareVal, w === 'car1' && styles.winnerVal]}>{formatter ? formatter(value1) : value1}</Text>
          {w === 'car1' && <Ionicons name="trophy" size={14} color={colors.success} style={{ marginTop: 2 }} />}
        </View>
        <View style={styles.compareMid}>
          <Text style={styles.compareLabel}>{label}</Text>
        </View>
        <View style={[styles.compareCell, w === 'car2' && styles.winnerCell]}>
          <Text style={[styles.compareVal, w === 'car2' && styles.winnerVal]}>{formatter ? formatter(value2) : value2}</Text>
          {w === 'car2' && <Ionicons name="trophy" size={14} color={colors.success} style={{ marginTop: 2 }} />}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.resultWrap}>
      <View style={styles.resultHeader}>
        <View style={styles.resultCol}>
          <Text style={styles.resultMarka} numberOfLines={1}>{r.car1.marka} {r.car1.model}</Text>
          <Text style={styles.resultYil}>{r.car1.yil}</Text>
        </View>
        <View style={styles.resultCol}>
          <Text style={styles.resultMarka} numberOfLines={1}>{r.car2.marka} {r.car2.model}</Text>
          <Text style={styles.resultYil}>{r.car2.yil}</Text>
        </View>
      </View>

      <Row label="Güven Skoru" value1={r.car1.guven_skoru} value2={r.car2.guven_skoru} winnerKey="guven_skoru" />
      <Row label="Yakıt 100km" value1={`${r.car1.yakit.toFixed(1)} L`} value2={`${r.car2.yakit.toFixed(1)} L`} winnerKey="yakit_100km_litre" />
      <Row label="Piyasa Min" value1={r.car1.fiyat_min} value2={r.car2.fiyat_min} winnerKey="fiyat_min_tl" formatter={fmtTL} />
      <Row label="Aylık Yakıt" value1={r.car1.aylik_yakit_tl} value2={r.car2.aylik_yakit_tl} winnerKey="aylik_yakit_tahmini_tl" formatter={fmtTL} />

      <View style={styles.adviceBox}>
        <Text style={styles.adviceLabel}>1. ARAÇ TAVSİYE</Text>
        <Text style={styles.adviceText}>{r.car1.alim_tavsiyesi}</Text>
      </View>
      <View style={styles.adviceBox}>
        <Text style={styles.adviceLabel}>2. ARAÇ TAVSİYE</Text>
        <Text style={styles.adviceText}>{r.car2.alim_tavsiyesi}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.xl, paddingBottom: spacing.md },
  eyebrow: { color: colors.brandSecondary, fontSize: 11, letterSpacing: 2, marginBottom: spacing.xs, fontWeight: '500' },
  title: { color: colors.onSurface, fontSize: 30, fontWeight: '500' },
  sub: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: spacing.xs },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl, marginTop: spacing.md },
  pickCard: {
    flex: 1,
    height: 160,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  pickLabel: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1.4, marginBottom: spacing.xs, fontWeight: '500' },
  pickPlaceholder: { color: colors.brand, fontSize: 12, marginTop: spacing.xs, fontWeight: '500' },
  pickMarka: { color: colors.onSurface, fontSize: 15, fontWeight: '500' },
  pickModel: { color: colors.onSurfaceSecondary, fontSize: 13 },
  pickYil: { color: colors.brandSecondary, fontSize: 12, marginTop: 2 },
  vs: { width: 32, alignItems: 'center' },
  vsText: { color: colors.brand, fontSize: 14, fontWeight: '500', letterSpacing: 1 },
  primaryBtn: {
    backgroundColor: colors.brand,
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    borderRadius: radius.md,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: '500' },
  errText: { color: colors.error, fontSize: 13, paddingHorizontal: spacing.xl, marginTop: spacing.sm },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '70%', paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxl, borderTopWidth: 1, borderColor: colors.border },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { color: colors.onSurface, fontSize: 18, fontWeight: '500' },
  modalItem: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  marka: { color: colors.onSurface, fontSize: 15, fontWeight: '500' },
  yil: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  scoreBadge: { width: 42, height: 42, borderRadius: radius.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  scoreValue: { fontSize: 14, fontWeight: '500' },
  resultWrap: { marginTop: spacing.xl, marginHorizontal: spacing.xl },
  resultHeader: { flexDirection: 'row', marginBottom: spacing.md, gap: spacing.md },
  resultCol: { flex: 1, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  resultMarka: { color: colors.onSurface, fontSize: 14, fontWeight: '500' },
  resultYil: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  compareRow: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, borderColor: colors.divider },
  compareCell: { flex: 1, paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center' },
  winnerCell: { backgroundColor: 'rgba(42,157,143,0.10)' },
  compareVal: { color: colors.onSurface, fontSize: 15 },
  winnerVal: { color: colors.success, fontWeight: '500' },
  compareMid: { paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center', minWidth: 90 },
  compareLabel: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1.2, textAlign: 'center', fontWeight: '500' },
  adviceBox: { marginTop: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderLeftWidth: 3, borderLeftColor: colors.brandSecondary },
  adviceLabel: { color: colors.brandSecondary, fontSize: 10, letterSpacing: 1.4, marginBottom: 4, fontWeight: '500' },
  adviceText: { color: colors.onSurface, fontSize: 13, lineHeight: 18 },
});
