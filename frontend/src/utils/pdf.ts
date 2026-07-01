import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

const esc = (s: string | undefined | null) =>
  (s ?? '').toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const fmtTL = (n: number) =>
  new Intl.NumberFormat('tr-TR').format(Math.round(n)) + ' &#8378;';

const levelBg = (l: string) =>
  l === 'green' ? '#DCFCE7' : l === 'yellow' ? '#FEF3C7' : l === 'red' ? '#FEE2E2' : '#E5E7EB';
const levelFg = (l: string) =>
  l === 'green' ? '#166534' : l === 'yellow' ? '#92400E' : l === 'red' ? '#991B1B' : '#374151';
const levelText = (l: string) =>
  l === 'green' ? 'İYİ' : l === 'yellow' ? 'DİKKAT' : l === 'red' ? 'KRİTİK' : '—';

type Report = any;

const issueBlock = (title: string, items: any[]) => {
  if (!items || items.length === 0) return '';
  return `
    <section class="block">
      <h2>${esc(title)}</h2>
      ${items.map((it) => `
        <div class="issue">
          <div class="issue-top">
            <span class="issue-title">${esc(it.baslik)}</span>
            <span class="badge" style="background:${levelBg(it.seviye)};color:${levelFg(it.seviye)}">${levelText(it.seviye)}</span>
          </div>
          <p>${esc(it.aciklama)}</p>
        </div>
      `).join('')}
    </section>`;
};

export const buildReportHtml = (r: Report) => `
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; margin: 32px; color: #111; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0A1628; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { color: #0A1628; font-size: 12px; letter-spacing: 2px; font-weight: 600; }
  h1 { margin: 4px 0 0 0; font-size: 28px; color: #0A1628; }
  .yil { color: #6b7280; font-size: 13px; margin-top: 4px; }
  .score-box { text-align: center; padding: 12px 20px; border: 2px solid #FFC93C; border-radius: 12px; }
  .score-label { color: #6b7280; font-size: 9px; letter-spacing: 1.4px; font-weight: 600; }
  .score-val { font-size: 42px; font-weight: 700; color: #0A1628; line-height: 1; }
  .score-max { color: #9CA3AF; font-size: 12px; }
  .summary { background: #F3F4F6; padding: 14px; border-radius: 8px; margin-bottom: 20px; font-size: 13px; line-height: 1.5; }
  .advice { border-left: 4px solid #FFC93C; padding: 12px 14px; background: #FFFBEB; border-radius: 8px; margin-bottom: 24px; }
  .advice-label { font-size: 10px; letter-spacing: 1.4px; color: #92400E; font-weight: 600; }
  .advice-text { font-size: 14px; margin-top: 4px; }
  .stats { display: flex; gap: 12px; margin-bottom: 24px; }
  .stat { flex: 1; background: #F9FAFB; border: 1px solid #E5E7EB; padding: 12px; border-radius: 8px; }
  .stat-label { color: #6b7280; font-size: 10px; letter-spacing: 1px; font-weight: 600; }
  .stat-val { color: #0A1628; font-size: 18px; font-weight: 700; margin-top: 4px; }
  .stat-sub { color: #6b7280; font-size: 11px; }
  .block { margin-bottom: 22px; page-break-inside: avoid; }
  .block h2 { font-size: 12px; letter-spacing: 1.6px; color: #6b7280; margin: 0 0 10px 0; font-weight: 600; }
  .issue { border: 1px solid #E5E7EB; padding: 10px 12px; margin-bottom: 8px; border-radius: 6px; }
  .issue-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .issue-title { font-weight: 600; font-size: 13px; }
  .badge { padding: 2px 8px; border-radius: 999px; font-size: 9px; font-weight: 700; letter-spacing: 0.8px; }
  .issue p { margin: 0; font-size: 12px; color: #374151; line-height: 1.4; }
  .maint { display: flex; justify-content: space-between; padding: 8px 12px; border: 1px solid #E5E7EB; border-radius: 6px; margin-bottom: 6px; }
  .maint-name { font-weight: 600; font-size: 12px; }
  .maint-period { font-size: 11px; color: #6b7280; }
  .maint-cost { color: #92400E; font-weight: 600; font-size: 12px; }
  ul.notes { margin: 6px 0 0 20px; padding: 0; }
  ul.notes li { font-size: 12px; line-height: 1.5; margin-bottom: 4px; }
  footer { border-top: 1px solid #E5E7EB; margin-top: 32px; padding-top: 12px; text-align: center; font-size: 10px; color: #9CA3AF; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">OTOEKSPERTİZ AI · EKSPERTİZ RAPORU</div>
      <h1>${esc(r.marka)} ${esc(r.model)}</h1>
      <div class="yil">${esc(String(r.yil))}${r.kilometre ? ' &middot; ' + new Intl.NumberFormat('tr-TR').format(r.kilometre) + ' km' : ''}</div>
    </div>
    <div class="score-box">
      <div class="score-label">GÜVEN SKORU</div>
      <div class="score-val">${r.guven_skoru}</div>
      <div class="score-max">/ 100</div>
    </div>
  </div>

  <div class="summary">${esc(r.ozet)}</div>

  <div class="advice">
    <div class="advice-label">AI TAVSİYESİ</div>
    <div class="advice-text">${esc(r.alim_tavsiyesi)}</div>
  </div>

  <div class="stats">
    <div class="stat">
      <div class="stat-label">PİYASA FİYAT ARALIĞI</div>
      <div class="stat-val">${fmtTL(r.fiyat_min_tl)} - ${fmtTL(r.fiyat_max_tl)}</div>
      <div class="stat-sub">${esc(r.fiyat_yorumu)}</div>
    </div>
    <div class="stat">
      <div class="stat-label">100 KM YAKIT</div>
      <div class="stat-val">${r.yakit_100km_litre.toFixed(1)} L</div>
      <div class="stat-sub">Aylık ~ ${fmtTL(r.aylik_yakit_tahmini_tl)}</div>
    </div>
  </div>

  ${issueBlock('MEKANİK SORUNLAR', r.mekanik_sorunlar)}
  ${issueBlock('ELEKTRİK SORUNLARI', r.elektrik_sorunlar)}
  ${issueBlock('KAPORTA & İÇ MEKAN', r.kaporta_ic_mekan)}
  ${issueBlock('OLASI MASRAFLAR', r.olasi_masraflar)}

  ${r.periyodik_bakim && r.periyodik_bakim.length > 0 ? `
  <section class="block">
    <h2>PERİYODİK BAKIM</h2>
    ${r.periyodik_bakim.map((m: any) => `
      <div class="maint">
        <div>
          <div class="maint-name">${esc(m.isim)}</div>
          <div class="maint-period">${esc(m.periyot)}</div>
        </div>
        <div class="maint-cost">${esc(m.tahmini_maliyet_tl)}</div>
      </div>
    `).join('')}
  </section>` : ''}

  ${r.dikkat_edilecek_noktalar && r.dikkat_edilecek_noktalar.length > 0 ? `
  <section class="block">
    <h2>DİKKAT EDİLECEK NOKTALAR</h2>
    <ul class="notes">
      ${r.dikkat_edilecek_noktalar.map((n: string) => `<li>${esc(n)}</li>`).join('')}
    </ul>
  </section>` : ''}

  <footer>
    Bu rapor OtoEkspertiz AI tarafından Gemini 2.5 Pro modeli ile üretilmiştir. Yatırım / satın alma kararı bilgi amaçlıdır.
  </footer>
</body>
</html>`;

export const shareReportAsPdf = async (report: Report) => {
  const html = buildReportHtml(report);
  const filename = `OtoEkspertiz_${report.marka}_${report.model}_${report.yil}`.replace(/[^\w-]/g, '_');
  const { uri } = await Print.printToFileAsync({ html });

  if (Platform.OS === 'web') {
    // On web, open PDF in new tab
    if (typeof window !== 'undefined') window.open(uri, '_blank');
    return { uri };
  }

  const available = await Sharing.isAvailableAsync();
  if (available) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Ekspertiz Raporunu Paylaş',
      UTI: 'com.adobe.pdf',
    });
  } else {
    await Print.printAsync({ html });
  }
  return { uri, filename };
};
