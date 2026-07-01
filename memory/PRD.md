# OtoEkspertiz AI — PRD

## Overview
Turkish mobile app (Expo React Native) that gives pre-purchase AI vehicle analysis. User enters brand + model + year, Gemini 2.5 Pro returns a structured report; Gemini 2.5 Flash powers follow-up Q&A on that report.

## Core Features

### Analysis (Gemini 2.5 Pro)
Trust score (0-100), summary, market price range (TL), fuel consumption + monthly cost, chronic mechanical/electrical/body issues (traffic-light: green/yellow/red), periodic maintenance schedule with cost brackets, potential expenses, buy/avoid recommendation, attention points.

### Chat (Gemini 2.5 Flash) — v1.2
Report-scoped chat: user asks follow-up questions about a specific vehicle. Fast Flash model, short conversational answers. Persisted per user + report. Suggestion chips for common questions.

### PDF Sharing — v1.2
Client-side PDF generation from report using `expo-print`. Native share dialog (iOS AirDrop, WhatsApp, email) via `expo-sharing`. On web opens PDF in new tab. HTML template with branded header, score box, categorized issues, maintenance table.

### Monetization (v1.1)
3 free credits on signup. Each analyze deducts 1 credit atomically. Refill via:
1. **Rewarded Ad** (+1) — MOCK now, real AdMob on native build
2. **Stripe Checkout** — works today via emergentintegrations proxy (`sk_test_emergent`)
3. **Native IAP** — MOCK verify now, real StoreKit/Play Billing on native build

Packages: small=3/$1, medium (popular)=10/$3, large=50/$10.

## Themes (v1.0-2)
Two themes, live-switchable in Profile, persisted in AsyncStorage:
- **Navy Blue** (default): #0A1628 + #FFC93C yellow
- **Carbon Dark**: #0D0E11 + #E63946 ember red

## Typography
Poppins Regular / Medium / SemiBold, bundled from `/assets/fonts/`.

## Endpoints
- Auth: `POST /api/auth/{register,login}`, `GET /api/auth/me`
- Analysis: `POST /api/analyze` (Gemini 2.5 Pro, deducts 1 credit), `GET /api/history`, `GET /api/reports/{id}`
- Chat: `GET /api/reports/{id}/chat`, `POST /api/reports/{id}/chat` (Gemini 2.5 Flash)
- Favorites: `GET/POST /api/favorites`, `DELETE /api/favorites/{id}`, `GET /api/favorites/ids`
- Compare: `POST /api/compare`
- Credits: `GET /api/credits/me`, `GET /api/credits/packages`, `POST /api/credits/reward-ad`
- Payments: `POST /api/checkout/create`, `GET /api/checkout/status/{id}`, `POST /api/iap/verify`

## LLM model usage (explicit)
| Feature | Model | Rationale |
|---|---|---|
| Auth, favorites, credits, compare | — | No LLM |
| Vehicle analysis report | Gemini 2.5 Pro | Deep reasoning over vehicle-specific chronic issues |
| Report follow-up chat | Gemini 2.5 Flash | Fast, cheap conversational Q&A |

## Screens
- `(auth)/login, register`
- `(app)/(tabs)/index` — search + credit pill
- `(app)/(tabs)/compare` — 2-car side-by-side
- `(app)/(tabs)/favorites` — favorites + history tabs
- `(app)/(tabs)/profile` — theme picker + credits card + logout
- `(app)/report/[id]` — full analysis + AI chat FAB + PDF share
- `(app)/credits` — paywall
- `checkout/return` — Stripe redirect landing

## Tech
- Backend: FastAPI + MongoDB (motor), JWT (python-jose), bcrypt, emergentintegrations (Gemini 2.5 Pro + Flash, Stripe wrapper)
- Frontend: Expo Router (file-based), Poppins via expo-font, expo-web-browser (Stripe), expo-print + expo-sharing (PDF)
- Deep-link scheme: `otoekspertiz`

## Env
- `EMERGENT_LLM_KEY`, `JWT_SECRET`, `MONGO_URL`, `DB_NAME`
- `STRIPE_API_KEY=sk_test_emergent` (routed through emergent proxy)
- `FREE_CREDITS_ON_SIGNUP=3`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_RESET_PASSWORD` (admin seeding, idempotent on startup)

## Admin (v1.3)
- `is_admin` flag on user document (auto-seeded from env on startup)
- Admin bypasses credit deduction in `/api/analyze` (unlimited queries)
- Admin panel screen `/(app)/admin` with 4 tabs:
  - **İstatistik:** total users, reports, 7-day analyses, chats, ad rewards, Stripe/IAP counts + revenue
  - **Kullanıcılar:** paginated user list with credit adjust modal
  - **Hareketler:** recent credit transactions (analyze, refund, admin adjust, purchase)
  - **Ödemeler:** recent Stripe sessions + IAP receipts
- Endpoints: `GET /api/admin/{stats,users,txns,payments}`, `POST /api/admin/users/{id}/credits`
- Frontend shows "ADMIN PANEL" row in Profile only when `user.is_admin === true`

## Native swap guide
See `/app/frontend/docs/native-integrations.md` for real AdMob + IAP integration steps after producing a native build.
