# AI Oto Analiz — PRD (v2.1)

## v2.1 UI Rebrand (June 2026)
- Rebranded from **OtoEkspertiz AI** → **AI OTO ANALİZ** (localized: EN "AI Auto Analysis", DE "KI Auto-Analyse", FR "IA Analyse Auto", ES "IA Análisis Auto", ZH "AI 车辆分析").
- Home tagline in Turkish updated to "7/24 hazır kıta, bir oto analiz ortağın." (localized in all 6 languages).
- Added **Pure White** light theme (white surfaces, navy `#0A1628` accent, amber `#B45309` secondary). Alongside Navy Blue and Carbon Dark. Hero gradient + credits pill adapted for light theme readability.
- Backend OG card, API root, PDF header/footer/filename all updated to new brand.


## Overview
Turkish + English + Chinese + German + French + Spanish mobile app for pre-purchase / pre-sale vehicle analysis. Two modes:
- **Buyer mode:** trust score, damage-adjusted market price, chronic defects, safety warnings, interior wear estimate, color-based sales speed, negotiation playbook
- **Seller mode:** ready-to-paste listing text tailored to the exact vehicle + damage history

## v2.0 Major Feature Drop

### 1. Damage & Value Loss (Feature 1)
Search form now has:
- **Değişen parça** counter (0..N)
- **Boyalı parça** counter (0..N)
- **Darbe bölgesi** chips: Yok · Ön · Arka · Yan · Tavan (multi-select except "Yok" is exclusive)
Backend applies these to the Gemini prompt with concrete deduction rules (each replaced part 3-6%, painted 1-2%, front/rear impact 4-8%, tavan/şase 15-25%, capped 45%).
Report shows `deger_kaybi_tl`, `deger_kaybi_yuzde`, `nihai_piyasa_degeri_tl` in a red-bordered card.

### 2. Buyer Negotiation Playbook (Feature 2)
In buyer mode, Gemini generates 5-7 concrete negotiation moves referencing exact TL amounts to discount based on damage/mileage/color. Shown as numbered `pazarlik_taktikleri` cards.

### 3. AI Listing Wizard (Feature 3)
In seller mode, Gemini produces a 200-300 word sahibinden.com-style listing text (honest but appealing, discloses damage). Displayed in `satici_ilan_metni` block with a Copy button.

### 4. Chronic Defects & Recalls (Feature 4)
`kronik_kusurlar` array: specific known factory/age defects for THIS make/model/year (e.g. "PSA 1.6 e-HDi mağara yataklı EGR", "DSG 7-vites Mekatronik ünitesi").
`kontrol_edilecek_parcalar` array: parts a mechanic MUST inspect. Shown as two sections in the report.

### 5. Interior Wear Estimate (Feature 5)
`ic_yipranma` array of `{parca, yuzde, aciklama}` (steering leather, driver seat cushion, gear knob, HVAC/multimedia buttons, door panels).
Displayed as progress bars with color coding (green<40%, yellow<70%, red≥70%).

### 6. Color Analysis (Feature 6)
Optional `renk` field. Gemini populates `renk_satis_hizi` (e.g. "En hızlı satılan") and `renk_boya_hassasiyeti` (sun-fade risk, matching parts risk).

### 7. i18n — 6 Languages (Feature 7)
Full app internationalization: **TR · EN · ZH · DE · FR · ES**.
- `useI18n()` context, persisted in AsyncStorage
- Profile screen has flag chips for each language
- AnalyzeIn.dil field sends selected language to backend
- Gemini system prompt receives target language name and returns ALL report strings in that language

### 8. Visual Richness + Price-Performance + OG Card (Feature 8)
- **Fiyat-Performans Skoru (0-100):** computed by Gemini considering damage + mileage + chronic issues + price. Rendered as second score card.
- **Dynamic image query:** `gorsel_arama` field (english keywords) that frontend can use to fetch a matching stock photo.
- **WhatsApp OG Card:** `GET /og/{report_id}` returns HTML page with `og:title`, `og:description`, `og:image` meta tags. `GET /og/{report_id}/card.png` generates a 1200×630 branded PNG server-side using Pillow (Poppins fonts, brand navy background, yellow accent bars, score box).

## Endpoints (updated)
| Method | Path | Notes |
|---|---|---|
| POST | /api/analyze | Now accepts `renk`, `degisen_parca`, `boyali_parca`, `darbe_bolgeleri`, `mod`, `dil` |
| GET | /og/{report_id} | Public HTML for social preview |
| GET | /og/{report_id}/card.png | Server-rendered 1200×630 PNG |

## LLM
- Analysis: **Gemini 2.5 Pro** (multilingual prompt, structured JSON)
- Chat: **Gemini 2.5 Flash**

## Credentials
- Regular: `test@oto.com / test123`
- Admin: `admin@otoekspertiz.com / OtoAdmin2026!`

## Env
- `EMERGENT_LLM_KEY`, `JWT_SECRET`, `MONGO_URL`, `DB_NAME`, `STRIPE_API_KEY`
- `FREE_CREDITS_ON_SIGNUP=3`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_RESET_PASSWORD`
