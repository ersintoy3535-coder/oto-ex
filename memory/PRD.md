# OtoEkspertiz AI — PRD

## Overview
A Turkish mobile app (Expo React Native) that provides pre-purchase AI-powered vehicle analysis. User enters brand + model + year (+ optional km/price), Gemini 2.5 Pro returns a detailed diagnostic report covering chronic issues (mechanical, electrical, body/interior), market price estimate (TL), fuel consumption, monthly fuel cost, periodic maintenance schedule with costs, potential expenses, and a final buy/avoid recommendation with trust score.

## Users
- Individuals evaluating a used car purchase in Turkey.

## Core Features
1. **JWT Auth** — register/login with email+password (bcrypt hashed, MongoDB).
2. **AI Analysis** — `POST /api/analyze` calls Gemini 2.5 Pro with structured JSON prompt returning:
   - Trust score (0–100)
   - Summary, market price min/max TL, price commentary
   - Fuel: L/100km + monthly TL estimate
   - Traffic-light categorized issues (mechanical, electrical, body/interior, potential expenses)
   - Periodic maintenance list with cost brackets
   - Buy/avoid recommendation + attention points
3. **History** — all past analyses stored per user.
4. **Favorites** — mark/unmark reports as favorite.
5. **Compare** — side-by-side of any 2 saved reports with winner highlights.
6. **Profile** — user info + logout.

## Design
- **Personality:** Dark-first utility (Ember Red #E63946 accent on carbon black #0D0E11).
- Turkish UI throughout.
- Bottom-tab navigation: Analiz · Karşılaştır · Favoriler · Profil.

## Tech
- Backend: FastAPI + MongoDB (motor), passlib/bcrypt, python-jose (JWT), emergentintegrations (Gemini 2.5 Pro).
- Frontend: Expo Router (file-based), React Native, AsyncStorage, expo-image, expo-linear-gradient, @expo/vector-icons.
- All endpoints prefixed `/api`.

## Env
- `EMERGENT_LLM_KEY` — Universal key for Gemini via emergentintegrations
- `JWT_SECRET`, `MONGO_URL`, `DB_NAME`
