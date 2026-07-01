# OtoEkspertiz AI — PRD

## Overview
A Turkish mobile app (Expo React Native) providing pre-purchase AI-powered vehicle analysis. Users search by brand + model + year (+ optional km/price), and Gemini 2.5 Pro returns a detailed diagnostic report covering chronic issues, market price estimate (TL), fuel consumption, monthly fuel cost, periodic maintenance schedule with costs, potential expenses, and a final buy/avoid recommendation with trust score.

## Monetization (v1.1)
Users receive **3 free query credits** on signup. Each `/api/analyze` call consumes 1 credit. Credits can be replenished via:

1. **Rewarded Ad** (+1 credit) — MOCK button now; real Google AdMob after native build
2. **Stripe Checkout** — cross-platform, works today (`WebBrowser.openAuthSessionAsync` flow, session polling for idempotent fulfillment)
3. **Native IAP** — MOCK verification now; real Apple StoreKit + Google Play Billing after native build

### Packages (server-defined)
| ID | Credits | Price | $/credit |
|---|---|---|---|
| small | 3 | $1 | $0.33 |
| medium (popular) | 10 | $3 | $0.30 |
| large | 50 | $10 | $0.20 |

### Endpoints
- `GET /api/credits/me` → `{ credits }`
- `GET /api/credits/packages` → package list
- `POST /api/credits/reward-ad` → idempotent by `ad_session_id`
- `POST /api/checkout/create` → Stripe Checkout Session URL
- `GET /api/checkout/status/{session_id}` → poll after redirect; idempotent fulfillment
- `POST /api/iap/verify` → mock now (accepts non-empty receipt, idempotent)

## Themes
Two themes selectable in Profile, persisted in AsyncStorage:
- **Navy Blue** (default): #0A1628 surface + #FFC93C yellow accent
- **Carbon Dark**: #0D0E11 surface + #E63946 ember red accent

## Typography
Poppins font family (Regular / Medium / SemiBold), loaded from `/assets/fonts/`.

## Screens
- **(auth)/login, register** — JWT email/password
- **(app)/(tabs)/index** — search + credit pill
- **(app)/(tabs)/compare** — 2-car side-by-side
- **(app)/(tabs)/favorites** — favorites + history tabs
- **(app)/(tabs)/profile** — theme picker + credit balance + logout
- **(app)/report/[id]** — full analysis report
- **(app)/credits** — paywall (ad + Stripe + IAP)
- **checkout/return** — Stripe redirect landing

## Tech
- **Backend:** FastAPI + MongoDB (motor), JWT (python-jose), bcrypt, emergentintegrations (Gemini 2.5 Pro), stripe
- **Frontend:** Expo Router (file-based), React Native, Poppins via expo-font, expo-web-browser for Stripe
- Deep link scheme: `otoekspertiz`

## Env
- `EMERGENT_LLM_KEY` — Universal key for Gemini
- `JWT_SECRET`, `MONGO_URL`, `DB_NAME`
- `STRIPE_API_KEY` (test key: `sk_test_emergent`)
- `FREE_CREDITS_ON_SIGNUP=3`

## Native swap guide
See `/app/frontend/docs/native-integrations.md` for AdMob + IAP production integration steps after a native build is produced.
