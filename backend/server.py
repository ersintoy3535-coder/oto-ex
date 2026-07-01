from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import logging
import uuid
import re
import stripe
from fastapi.responses import HTMLResponse, Response
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout,
    CheckoutSessionRequest,
)
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from pydantic import BaseModel, Field, EmailStr
from passlib.context import CryptContext
from jose import jwt, JWTError

from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']
STRIPE_API_KEY = os.environ['STRIPE_API_KEY']
FREE_CREDITS = int(os.environ.get('FREE_CREDITS_ON_SIGNUP', '3'))
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', '').lower().strip()
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', '')
ADMIN_RESET_PASSWORD = os.environ.get('ADMIN_RESET_PASSWORD', 'false').lower() in ('1', 'true', 'yes', 'on')
JWT_ALG = "HS256"
JWT_EXPIRE_DAYS = 30

stripe.api_key = STRIPE_API_KEY
stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY)

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI()
api_router = APIRouter(prefix="/api")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
DUMMY_HASH = pwd_context.hash("dummy-password-for-timing-attack")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

logger = logging.getLogger("oto_ekspertiz")
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')


# --------- Packages ----------
# Server-defined pricing to prevent client tampering
CREDIT_PACKAGES = {
    "small": {"id": "small", "credits": 3, "price_usd_cents": 100, "label": "3 Sorgu"},
    "medium": {"id": "medium", "credits": 10, "price_usd_cents": 300, "label": "10 Sorgu"},
    "large": {"id": "large", "credits": 50, "price_usd_cents": 1000, "label": "50 Sorgu"},
}


# ---------------- Models ----------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    full_name: Optional[str] = None
    query_credits: int = 0
    is_admin: bool = False


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class AnalyzeIn(BaseModel):
    marka: str
    model: str
    yil: int
    kilometre: Optional[int] = None
    istenilen_fiyat: Optional[float] = None
    renk: Optional[str] = None
    degisen_parca: Optional[int] = 0
    boyali_parca: Optional[int] = 0
    degisen_parcalar_metni: Optional[str] = None  # kullanıcının serbest metni: "sağ ön çamurluk, kaput..."
    boyali_parcalar_metni: Optional[str] = None
    darbe_bolgeleri: Optional[List[str]] = None
    mod: Optional[str] = "buyer"
    dil: Optional[str] = "tr"


class TrafficLightItem(BaseModel):
    baslik: str
    aciklama: str
    seviye: str


class MaintenanceItem(BaseModel):
    isim: str
    periyot: str
    tahmini_maliyet_tl: str


class WearItem(BaseModel):
    parca: str
    yuzde: int
    aciklama: str


class AnalysisReport(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    marka: str
    model: str
    yil: int
    kilometre: Optional[int] = None
    istenilen_fiyat: Optional[float] = None
    renk: Optional[str] = None
    degisen_parca: Optional[int] = 0
    boyali_parca: Optional[int] = 0
    darbe_bolgeleri: Optional[List[str]] = None
    mod: Optional[str] = "buyer"
    dil: Optional[str] = "tr"
    # Original scoring
    guven_skoru: int
    fiyat_performans_skoru: int = 0
    ozet: str
    fiyat_min_tl: float
    fiyat_max_tl: float
    fiyat_yorumu: str
    # NEW: value loss from damage
    deger_kaybi_tl: float = 0
    deger_kaybi_yuzde: float = 0
    nihai_piyasa_degeri_tl: float = 0
    # Fuel
    yakit_100km_litre: float
    aylik_yakit_tahmini_tl: float
    # Issue categories (traffic-light)
    mekanik_sorunlar: List[TrafficLightItem]
    elektrik_sorunlar: List[TrafficLightItem]
    kaporta_ic_mekan: List[TrafficLightItem]
    olasi_masraflar: List[TrafficLightItem]
    # Maintenance
    periyodik_bakim: List[MaintenanceItem]
    # NEW: chronic issues & recalls
    kronik_kusurlar: List[str] = []
    kontrol_edilecek_parcalar: List[str] = []
    # NEW: safety warnings (kritik bölge uyarıları — front damage → shasi/podye/airbag)
    guvenlik_uyarilari: List[str] = []
    # NEW: interior wear estimates
    ic_yipranma: List[WearItem] = []
    # NEW: color analysis
    renk_satis_hizi: Optional[str] = None
    renk_boya_hassasiyeti: Optional[str] = None
    # NEW: negotiation tactics (buyer)
    pazarlik_taktikleri: List[str] = []
    # NEW: seller listing text
    satici_ilan_metni: Optional[str] = None
    # NEW: dynamic image query for hero
    gorsel_arama: Optional[str] = None
    # Existing final
    alim_tavsiyesi: str
    dikkat_edilecek_noktalar: List[str]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_id: Optional[str] = None


class CompareIn(BaseModel):
    car1_id: str
    car2_id: str


class ChatIn(BaseModel):
    report_id: str
    message: str


class ChatMsgOut(BaseModel):
    role: str  # "user" | "assistant"
    text: str
    created_at: datetime


class CheckoutCreateIn(BaseModel):
    package_id: str
    origin_url: str  # frontend origin, e.g., https://auto-assess-6.preview.emergentagent.com


class IapVerifyIn(BaseModel):
    package_id: str
    platform: str  # "ios" | "android"
    receipt: str   # base64 receipt or purchaseToken


class RewardAdIn(BaseModel):
    ad_session_id: str  # client-generated UUID per successful ad view (idempotency)


# ---------------- Helpers ----------------
def hash_password(pw: str) -> str:
    return pwd_context.hash(pw)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRE_DAYS)
    payload = {"sub": user_id, "exp": int(exp.timestamp())}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def user_to_out(u: dict) -> UserOut:
    return UserOut(
        id=u["id"],
        email=u["email"],
        full_name=u.get("full_name"),
        query_credits=int(u.get("query_credits", 0)),
        is_admin=bool(u.get("is_admin", False)),
    )


async def get_current_user(token: str = Depends(oauth2_scheme)) -> UserOut:
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token geçersiz",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload.get("sub")
        if not user_id:
            raise cred_exc
    except JWTError:
        raise cred_exc
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise cred_exc
    return user_to_out(user)


async def get_current_admin(current: UserOut = Depends(get_current_user)) -> UserOut:
    if not current.is_admin:
        raise HTTPException(status_code=403, detail="Admin yetkisi gerekli")
    return current


def strip_json_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


async def add_credits(user_id: str, delta: int, reason: str, meta: dict | None = None):
    await db.users.update_one({"id": user_id}, {"$inc": {"query_credits": delta}})
    await db.credit_txns.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "delta": delta,
        "reason": reason,
        "meta": meta or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


# ---------------- Auth Routes ----------------
@api_router.post("/auth/register", response_model=TokenOut, status_code=201)
async def register(data: RegisterIn):
    existing = await db.users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(409, "Bu e-posta ile zaten kayıt var")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "email": data.email.lower(),
        "full_name": data.full_name,
        "password_hash": hash_password(data.password),
        "query_credits": FREE_CREDITS,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    await db.credit_txns.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "delta": FREE_CREDITS,
        "reason": "signup_bonus",
        "meta": {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    token = create_access_token(user_id)
    return TokenOut(access_token=token, user=user_to_out(doc))


@api_router.post("/auth/login", response_model=TokenOut)
async def login(data: LoginIn):
    user = await db.users.find_one({"email": data.email.lower()})
    if not user:
        verify_password(data.password, DUMMY_HASH)
        raise HTTPException(401, "E-posta veya şifre hatalı")
    if not verify_password(data.password, user["password_hash"]):
        raise HTTPException(401, "E-posta veya şifre hatalı")
    token = create_access_token(user["id"])
    return TokenOut(access_token=token, user=user_to_out(user))


@api_router.get("/auth/me", response_model=UserOut)
async def me(current_user: UserOut = Depends(get_current_user)):
    return current_user


# ---------------- Credits Routes ----------------
@api_router.get("/credits/me")
async def get_credits(current_user: UserOut = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user.id}, {"_id": 0, "query_credits": 1})
    return {"credits": int(user.get("query_credits", 0)) if user else 0}


@api_router.get("/credits/packages")
async def packages():
    return {"packages": list(CREDIT_PACKAGES.values())}


@api_router.post("/credits/reward-ad")
async def reward_ad(data: RewardAdIn, current_user: UserOut = Depends(get_current_user)):
    """Grant 1 credit per rewarded ad view. Idempotent by ad_session_id."""
    if not data.ad_session_id or len(data.ad_session_id) < 8:
        raise HTTPException(400, "ad_session_id gerekli")
    existing = await db.ad_rewards.find_one({"ad_session_id": data.ad_session_id})
    if existing:
        return {"ok": True, "credited": 0, "message": "Zaten kredilendirildi"}
    await db.ad_rewards.insert_one({
        "id": str(uuid.uuid4()),
        "ad_session_id": data.ad_session_id,
        "user_id": current_user.id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await add_credits(current_user.id, 1, "ad_reward", {"ad_session_id": data.ad_session_id})
    user = await db.users.find_one({"id": current_user.id}, {"_id": 0, "query_credits": 1})
    return {"ok": True, "credited": 1, "balance": user.get("query_credits", 0)}


# ---------------- Stripe Checkout ----------------
@api_router.post("/checkout/create")
async def create_checkout(data: CheckoutCreateIn, current_user: UserOut = Depends(get_current_user)):
    pkg = CREDIT_PACKAGES.get(data.package_id)
    if not pkg:
        raise HTTPException(400, "Geçersiz paket")

    origin = data.origin_url.rstrip("/")
    success_url = f"{origin}/checkout/return?session_id={{CHECKOUT_SESSION_ID}}&status=success"
    cancel_url = f"{origin}/checkout/return?status=cancel"

    try:
        req = CheckoutSessionRequest(
            amount=pkg["price_usd_cents"] / 100.0,
            currency="usd",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                "user_id": current_user.id,
                "package_id": pkg["id"],
                "credits": str(pkg["credits"]),
            },
        )
        session = await stripe_checkout.create_checkout_session(req)
    except Exception as e:
        logger.exception("stripe checkout create failed")
        raise HTTPException(502, f"Stripe hatası: {str(e)}")

    await db.stripe_sessions.insert_one({
        "session_id": session.session_id,
        "user_id": current_user.id,
        "package_id": pkg["id"],
        "credits": pkg["credits"],
        "amount_cents": pkg["price_usd_cents"],
        "fulfilled": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"session_id": session.session_id, "url": session.url}


@api_router.get("/checkout/status/{session_id}")
async def checkout_status(session_id: str, current_user: UserOut = Depends(get_current_user)):
    """Poll after Stripe redirect. Idempotently fulfill credits if paid."""
    record = await db.stripe_sessions.find_one({"session_id": session_id, "user_id": current_user.id}, {"_id": 0})
    if not record:
        raise HTTPException(404, "Ödeme oturumu bulunamadı")

    try:
        session = await stripe_checkout.get_checkout_status(session_id)
    except Exception as e:
        raise HTTPException(502, f"Stripe hatası: {str(e)}")

    paid = session.payment_status == "paid"
    credited_now = 0
    if paid and not record.get("fulfilled"):
        # atomic fulfill
        result = await db.stripe_sessions.update_one(
            {"session_id": session_id, "fulfilled": False},
            {"$set": {"fulfilled": True, "fulfilled_at": datetime.now(timezone.utc).isoformat()}},
        )
        if result.modified_count == 1:
            await add_credits(current_user.id, record["credits"], "stripe_purchase", {
                "session_id": session_id, "package_id": record["package_id"],
            })
            credited_now = record["credits"]

    user = await db.users.find_one({"id": current_user.id}, {"_id": 0, "query_credits": 1})
    return {
        "paid": paid,
        "status": session.payment_status,
        "credited_now": credited_now,
        "balance": int(user.get("query_credits", 0)),
    }


# ---------------- Native IAP (mock verification) ----------------
@api_router.post("/iap/verify")
async def iap_verify(data: IapVerifyIn, current_user: UserOut = Depends(get_current_user)):
    """
    MOCK IAP receipt verification.
    In production: verify iOS receipt with Apple `/verifyReceipt`, or Google Play Developer API for Android.
    For now: accept receipt if non-empty, idempotent by receipt string.
    """
    pkg = CREDIT_PACKAGES.get(data.package_id)
    if not pkg:
        raise HTTPException(400, "Geçersiz paket")
    if not data.receipt or len(data.receipt) < 8:
        raise HTTPException(400, "Makbuz geçersiz")
    if data.platform not in ("ios", "android"):
        raise HTTPException(400, "platform ios/android olmalı")

    existing = await db.iap_receipts.find_one({"receipt": data.receipt})
    if existing:
        return {"ok": True, "credited": 0, "message": "Zaten kredilendirildi"}

    await db.iap_receipts.insert_one({
        "id": str(uuid.uuid4()),
        "receipt": data.receipt,
        "user_id": current_user.id,
        "package_id": pkg["id"],
        "platform": data.platform,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await add_credits(current_user.id, pkg["credits"], "iap_purchase", {
        "package_id": pkg["id"], "platform": data.platform,
    })
    user = await db.users.find_one({"id": current_user.id}, {"_id": 0, "query_credits": 1})
    return {"ok": True, "credited": pkg["credits"], "balance": user.get("query_credits", 0)}


# ---------------- AI Analysis (deducts 1 credit) ----------------
LANG_NAME = {
    "tr": "Turkish (Türkçe)",
    "en": "English",
    "zh": "Simplified Chinese (中文)",
    "de": "German (Deutsch)",
    "fr": "French (Français)",
    "es": "Spanish (Español)",
}

SYSTEM_PROMPT_TEMPLATE = """You are an experienced Turkish automotive expert with 20+ years of experience. The user will send you brand, model, year, kilometers, color, and body-damage history of a car. You will produce a rigorous PRE-PURCHASE inspection report.

CRITICAL: Respond in language = {lang_name}. All string values in the JSON must be in that language. Keys stay in Turkish exactly as in the schema below. Prices in Turkish Lira (TL). Do NOT wrap in code fences. Reply ONLY with valid JSON.

Schema (all keys required, no extras):
{{
  "guven_skoru": <int 0-100, overall trust>,
  "fiyat_performans_skoru": <int 0-100, value-for-money considering damage, mileage, chronic issues, price>,
  "ozet": "<2-3 sentence summary>",
  "fiyat_min_tl": <number, TL, undamaged fair market min>,
  "fiyat_max_tl": <number, TL, undamaged fair market max>,
  "fiyat_yorumu": "<if user gave a price: label it 'UYGUN/PAHALI/UCUZ' (or translated) and explain briefly>",
  "deger_kaybi_tl": <number, TL lost due to given damage history (changed parts + painted parts + impact zones)>,
  "deger_kaybi_yuzde": <number 0-100, same as percent>,
  "nihai_piyasa_degeri_tl": <number, TL: adjusted mid price after damage deduction>,
  "yakit_100km_litre": <decimal>,
  "aylik_yakit_tahmini_tl": <number, monthly TL at 1500 km/month>,
  "mekanik_sorunlar": [{{"baslik": "...", "aciklama": "...", "seviye": "green|yellow|red"}}],
  "elektrik_sorunlar": [{{"baslik": "...", "aciklama": "...", "seviye": "green|yellow|red"}}],
  "kaporta_ic_mekan": [{{"baslik": "...", "aciklama": "...", "seviye": "green|yellow|red"}}],
  "olasi_masraflar": [{{"baslik": "...", "aciklama": "...", "seviye": "green|yellow|red"}}],
  "periyodik_bakim": [{{"isim": "...", "periyot": "...", "tahmini_maliyet_tl": "..."}}],
  "kronik_kusurlar": ["<specific known factory / age-related chronic defect for THIS brand+model+year>"],
  "kontrol_edilecek_parcalar": ["<specific parts a mechanic must inspect before purchase>"],
  "guvenlik_uyarilari": ["<CRITICAL SAFETY WARNING lines. If 'on' impact given, mention chassis/podye/radiator panel/airbag risk in ALL CAPS start. If 'tavan' painted, mention rollover-severe-damage risk. If 'yan' impact, side airbags & B pillar. Etc.>"],
  "ic_yipranma": [{{"parca": "Direksiyon derisi|Sürücü koltuğu minderi|Vites topuzu|Klima/multimedya tuş takımı|Kapı döşemeleri", "yuzde": <int 0-100>, "aciklama": "<short>"}}],
  "renk_satis_hizi": "<if renk given: how fast that color sells for this model in Turkey — 'En hızlı satılan', 'Ortalama', 'Niş kitle', etc. If no color: empty string>",
  "renk_boya_hassasiyeti": "<if renk given: paint sensitivity: sun-fade, scratch visibility, matching parts risk. If no color: empty string>",
  "pazarlik_taktikleri": ["<For BUYER MODE only: 5-7 concrete negotiation moves tailored to the given damage/mileage/color, referencing exact TL amounts to knock off>"],
  "satici_ilan_metni": "<For SELLER MODE only: a ready-to-copy sahibinden.com style listing description (max 250 words), honest yet appealing, mentioning all positives + transparently noting damage. Empty string if buyer mode.>",
  "gorsel_arama": "<2-4 keyword english search string for an Unsplash image of THIS car, e.g. 'white 2018 Toyota Corolla'>",
  "alim_tavsiyesi": "<clear verdict: STRONG BUY / CAUTIOUS BUY / DO NOT BUY (translated) + reasoning>",
  "dikkat_edilecek_noktalar": ["<5-10 bullet points>"]
}}

Rules:
- Each traffic-light category must have AT LEAST 3 items.
- "seviye" MUST be exactly one of green/yellow/red (English tokens).
- Chronic issues must be specific to the exact make/model/year (real known defects), not generic advice.
- Value loss guidance: each replaced part ≈ 3-6% deduction, each painted part ≈ 1-2%, impact zone (on/arka) ≈ 4-8%, tavan/şase ≈ 15-25%. Cap total loss at 45%.
- If mod == 'seller', focus pazarlik_taktikleri as an empty array and fill satici_ilan_metni. Else vice versa.
- Prices reflect 2026 Turkey market."""


@api_router.post("/analyze", response_model=AnalysisReport)
async def analyze_vehicle(data: AnalyzeIn, current_user: UserOut = Depends(get_current_user)):
    # Admins bypass credit deduction entirely
    if not current_user.is_admin:
        # Atomic credit deduction (only if credits > 0)
        result = await db.users.find_one_and_update(
            {"id": current_user.id, "query_credits": {"$gt": 0}},
            {"$inc": {"query_credits": -1}},
            return_document=False,
        )
        if not result:
            raise HTTPException(
                status_code=402,
                detail={
                    "code": "insufficient_credits",
                    "message": "Sorgu hakkınız bitti. Reklam izle veya paket satın al.",
                },
            )
        await db.credit_txns.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": current_user.id,
            "delta": -1,
            "reason": "analyze",
            "meta": {"marka": data.marka, "model": data.model, "yil": data.yil},
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    lang = data.dil if data.dil in LANG_NAME else "tr"
    lang_name = LANG_NAME[lang]
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(lang_name=lang_name)

    parts = [
        f"Brand/Marka: {data.marka}",
        f"Model: {data.model}",
        f"Year/Yıl: {data.yil}",
        f"Mode/Mod: {data.mod or 'buyer'}",
    ]
    if data.kilometre is not None:
        parts.append(f"Kilometers/Kilometre: {data.kilometre}")
    if data.istenilen_fiyat is not None:
        parts.append(f"Asking price/İstenilen fiyat (TL): {data.istenilen_fiyat}")
    if data.renk:
        parts.append(f"Color/Renk: {data.renk}")
    parts.append(f"Değişen parça sayısı (parts replaced): {data.degisen_parca or 0}")
    if data.degisen_parcalar_metni:
        parts.append(f"Değişen parçaların detayı (which parts were REPLACED, user free text): {data.degisen_parcalar_metni}")
    parts.append(f"Boyalı parça sayısı (parts painted): {data.boyali_parca or 0}")
    if data.boyali_parcalar_metni:
        parts.append(f"Boyalı parçaların detayı (which parts were PAINTED, user free text): {data.boyali_parcalar_metni}")
    if data.darbe_bolgeleri:
        parts.append(f"Darbe bölgeleri (impact zones): {', '.join(data.darbe_bolgeleri)}")
    prompt = "\n".join(parts) + "\n\nProduce the full JSON analysis now."

    session_id = f"analyze-{uuid.uuid4()}"
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system_prompt,
    ).with_model("gemini", "gemini-2.5-pro")

    try:
        response = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        if not current_user.is_admin:
            await db.users.update_one({"id": current_user.id}, {"$inc": {"query_credits": 1}})
            await db.credit_txns.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": current_user.id,
                "delta": 1,
                "reason": "refund_llm_error",
                "meta": {"error": str(e)[:200]},
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        logger.exception("LLM error")
        raise HTTPException(502, f"AI analiz servisi hata verdi: {str(e)}")

    raw = strip_json_fence(response if isinstance(response, str) else str(response))
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            if not current_user.is_admin:
                await db.users.update_one({"id": current_user.id}, {"$inc": {"query_credits": 1}})
            logger.error(f"Failed to parse JSON: {raw[:500]}")
            raise HTTPException(502, "AI cevabı ayrıştırılamadı")
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError:
            if not current_user.is_admin:
                await db.users.update_one({"id": current_user.id}, {"$inc": {"query_credits": 1}})
            raise HTTPException(502, "AI cevabı geçersiz JSON")

    def _safe_list_dict(key, model_cls):
        items = parsed.get(key, []) or []
        out = []
        for x in items:
            try:
                out.append(model_cls(**x))
            except Exception:
                pass
        return out

    report = AnalysisReport(
        marka=data.marka,
        model=data.model,
        yil=data.yil,
        kilometre=data.kilometre,
        istenilen_fiyat=data.istenilen_fiyat,
        renk=data.renk,
        degisen_parca=data.degisen_parca or 0,
        boyali_parca=data.boyali_parca or 0,
        darbe_bolgeleri=data.darbe_bolgeleri or [],
        mod=data.mod or "buyer",
        dil=lang,        guven_skoru=int(parsed.get("guven_skoru", 50)),
        fiyat_performans_skoru=int(parsed.get("fiyat_performans_skoru", 50)),
        ozet=parsed.get("ozet", ""),
        fiyat_min_tl=float(parsed.get("fiyat_min_tl", 0)),
        fiyat_max_tl=float(parsed.get("fiyat_max_tl", 0)),
        fiyat_yorumu=parsed.get("fiyat_yorumu", ""),
        deger_kaybi_tl=float(parsed.get("deger_kaybi_tl", 0)),
        deger_kaybi_yuzde=float(parsed.get("deger_kaybi_yuzde", 0)),
        nihai_piyasa_degeri_tl=float(parsed.get("nihai_piyasa_degeri_tl", 0)),
        yakit_100km_litre=float(parsed.get("yakit_100km_litre", 0)),
        aylik_yakit_tahmini_tl=float(parsed.get("aylik_yakit_tahmini_tl", 0)),
        mekanik_sorunlar=_safe_list_dict("mekanik_sorunlar", TrafficLightItem),
        elektrik_sorunlar=_safe_list_dict("elektrik_sorunlar", TrafficLightItem),
        kaporta_ic_mekan=_safe_list_dict("kaporta_ic_mekan", TrafficLightItem),
        olasi_masraflar=_safe_list_dict("olasi_masraflar", TrafficLightItem),
        periyodik_bakim=_safe_list_dict("periyodik_bakim", MaintenanceItem),
        kronik_kusurlar=parsed.get("kronik_kusurlar", []) or [],
        kontrol_edilecek_parcalar=parsed.get("kontrol_edilecek_parcalar", []) or [],
        guvenlik_uyarilari=parsed.get("guvenlik_uyarilari", []) or [],
        ic_yipranma=_safe_list_dict("ic_yipranma", WearItem),
        renk_satis_hizi=parsed.get("renk_satis_hizi") or None,
        renk_boya_hassasiyeti=parsed.get("renk_boya_hassasiyeti") or None,
        pazarlik_taktikleri=parsed.get("pazarlik_taktikleri", []) or [],
        satici_ilan_metni=parsed.get("satici_ilan_metni") or None,
        gorsel_arama=parsed.get("gorsel_arama") or None,
        alim_tavsiyesi=parsed.get("alim_tavsiyesi", ""),
        dikkat_edilecek_noktalar=parsed.get("dikkat_edilecek_noktalar", []) or [],
        user_id=current_user.id,
    )
    doc = report.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.reports.insert_one(doc)
    doc.pop("_id", None)
    return report


@api_router.get("/history", response_model=List[AnalysisReport])
async def history(current_user: UserOut = Depends(get_current_user)):
    cursor = db.reports.find({"user_id": current_user.id}, {"_id": 0}).sort("created_at", -1).limit(50)
    docs = await cursor.to_list(50)
    out = []
    for d in docs:
        if isinstance(d.get("created_at"), str):
            d["created_at"] = datetime.fromisoformat(d["created_at"])
        out.append(AnalysisReport(**d))
    return out


@api_router.get("/reports/{report_id}", response_model=AnalysisReport)
async def get_report(report_id: str, current_user: UserOut = Depends(get_current_user)):
    doc = await db.reports.find_one({"id": report_id, "user_id": current_user.id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Rapor bulunamadı")
    if isinstance(doc.get("created_at"), str):
        doc["created_at"] = datetime.fromisoformat(doc["created_at"])
    return AnalysisReport(**doc)


# ---------------- Favorites ----------------
@api_router.post("/favorites/{report_id}")
async def add_favorite(report_id: str, current_user: UserOut = Depends(get_current_user)):
    doc = await db.reports.find_one({"id": report_id, "user_id": current_user.id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Rapor bulunamadı")
    existing = await db.favorites.find_one({"user_id": current_user.id, "report_id": report_id})
    if existing:
        return {"ok": True, "message": "Zaten favorilerde"}
    await db.favorites.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": current_user.id,
        "report_id": report_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}


@api_router.delete("/favorites/{report_id}")
async def remove_favorite(report_id: str, current_user: UserOut = Depends(get_current_user)):
    await db.favorites.delete_one({"user_id": current_user.id, "report_id": report_id})
    return {"ok": True}


@api_router.get("/favorites", response_model=List[AnalysisReport])
async def list_favorites(current_user: UserOut = Depends(get_current_user)):
    favs = await db.favorites.find({"user_id": current_user.id}, {"_id": 0}).to_list(200)
    report_ids = [f["report_id"] for f in favs]
    if not report_ids:
        return []
    cursor = db.reports.find({"id": {"$in": report_ids}, "user_id": current_user.id}, {"_id": 0})
    docs = await cursor.to_list(200)
    out = []
    for d in docs:
        if isinstance(d.get("created_at"), str):
            d["created_at"] = datetime.fromisoformat(d["created_at"])
        out.append(AnalysisReport(**d))
    return out


@api_router.get("/favorites/ids")
async def list_favorite_ids(current_user: UserOut = Depends(get_current_user)):
    favs = await db.favorites.find({"user_id": current_user.id}, {"_id": 0, "report_id": 1}).to_list(200)
    return {"ids": [f["report_id"] for f in favs]}


# ---------------- Compare ----------------
@api_router.post("/compare")
async def compare(data: CompareIn, current_user: UserOut = Depends(get_current_user)):
    r1 = await db.reports.find_one({"id": data.car1_id, "user_id": current_user.id}, {"_id": 0})
    r2 = await db.reports.find_one({"id": data.car2_id, "user_id": current_user.id}, {"_id": 0})
    if not r1 or not r2:
        raise HTTPException(404, "Rapor(lar) bulunamadı")

    def winner(a, b, key, higher_better=True):
        av, bv = a[key], b[key]
        if av == bv:
            return "tie"
        if higher_better:
            return "car1" if av > bv else "car2"
        return "car1" if av < bv else "car2"

    return {
        "car1": {"marka": r1["marka"], "model": r1["model"], "yil": r1["yil"], "guven_skoru": r1["guven_skoru"], "yakit": r1["yakit_100km_litre"], "fiyat_min": r1["fiyat_min_tl"], "fiyat_max": r1["fiyat_max_tl"], "aylik_yakit_tl": r1["aylik_yakit_tahmini_tl"], "alim_tavsiyesi": r1["alim_tavsiyesi"]},
        "car2": {"marka": r2["marka"], "model": r2["model"], "yil": r2["yil"], "guven_skoru": r2["guven_skoru"], "yakit": r2["yakit_100km_litre"], "fiyat_min": r2["fiyat_min_tl"], "fiyat_max": r2["fiyat_max_tl"], "aylik_yakit_tl": r2["aylik_yakit_tahmini_tl"], "alim_tavsiyesi": r2["alim_tavsiyesi"]},
        "winners": {
            "guven_skoru": winner(r1, r2, "guven_skoru", True),
            "yakit_100km_litre": winner(r1, r2, "yakit_100km_litre", False),
            "fiyat_min_tl": winner(r1, r2, "fiyat_min_tl", False),
            "aylik_yakit_tahmini_tl": winner(r1, r2, "aylik_yakit_tahmini_tl", False),
        },
    }


# ---------------- Report Chat (Gemini 2.5 Flash) ----------------
def build_chat_system(report: dict) -> str:
    return f"""Sen bir Türk otomotiv ekspertiz uzmanısın. Kullanıcı belirli bir araçla ilgili sana sorular soracak. Aracın detaylı raporu aşağıdadır. Sorularını KISA, NET ve TÜRKÇE cevapla (2-4 cümle).

ARAÇ: {report['marka']} {report['model']} {report['yil']}
Güven skoru: {report['guven_skoru']}/100
Yakıt: {report['yakit_100km_litre']} L/100km
Piyasa fiyat aralığı: {report['fiyat_min_tl']:.0f} - {report['fiyat_max_tl']:.0f} TL
Ekspertiz özeti: {report['ozet']}
Tavsiye: {report['alim_tavsiyesi']}

Mekanik: {', '.join([m['baslik'] for m in report.get('mekanik_sorunlar', [])[:5]])}
Elektrik: {', '.join([m['baslik'] for m in report.get('elektrik_sorunlar', [])[:5]])}
Olası masraflar: {', '.join([m['baslik'] for m in report.get('olasi_masraflar', [])[:5]])}

Kurallar:
- Sadece bu araçla ilgili soruları yanıtla.
- Alakasız soru gelirse kibarca konuyu araca yönlendir.
- Uzunca listeler değil, sohbet tarzı kısa cevaplar ver."""


@api_router.get("/reports/{report_id}/chat")
async def get_chat(report_id: str, current_user: UserOut = Depends(get_current_user)):
    report = await db.reports.find_one({"id": report_id, "user_id": current_user.id}, {"_id": 0})
    if not report:
        raise HTTPException(404, "Rapor bulunamadı")
    msgs = await db.chat_messages.find(
        {"report_id": report_id, "user_id": current_user.id}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    return {"messages": msgs}


@api_router.post("/reports/{report_id}/chat")
async def send_chat(report_id: str, data: ChatIn, current_user: UserOut = Depends(get_current_user)):
    if not data.message.strip():
        raise HTTPException(400, "Mesaj boş olamaz")
    report = await db.reports.find_one({"id": report_id, "user_id": current_user.id}, {"_id": 0})
    if not report:
        raise HTTPException(404, "Rapor bulunamadı")

    # Store user message
    now = datetime.now(timezone.utc).isoformat()
    user_msg = {
        "id": str(uuid.uuid4()),
        "report_id": report_id,
        "user_id": current_user.id,
        "role": "user",
        "text": data.message.strip()[:1000],
        "created_at": now,
    }
    await db.chat_messages.insert_one(user_msg)
    user_msg.pop("_id", None)

    # Load recent history (last 10 messages) for context
    history = await db.chat_messages.find(
        {"report_id": report_id, "user_id": current_user.id}, {"_id": 0}
    ).sort("created_at", -1).limit(11).to_list(11)
    history.reverse()  # oldest first

    session_id = f"chat-{report_id}-{current_user.id}"
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=build_chat_system(report),
    ).with_model("gemini", "gemini-2.5-flash")

    # Compose conversation as a single user turn since LlmChat has one system message
    # and we pass fresh session each request; prepend recent turns as context.
    prior_lines = []
    for m in history[:-1]:  # exclude the just-inserted user message (it's the current turn)
        prefix = "Kullanıcı" if m["role"] == "user" else "Uzman"
        prior_lines.append(f"{prefix}: {m['text']}")
    prior_context = "\n".join(prior_lines)
    prompt_text = (
        (f"Önceki konuşma:\n{prior_context}\n\n" if prior_context else "")
        + f"Yeni soru: {data.message.strip()}"
    )

    try:
        response = await chat.send_message(UserMessage(text=prompt_text))
    except Exception as e:
        logger.exception("chat LLM error")
        raise HTTPException(502, f"Sohbet servisi hata verdi: {str(e)}")

    reply_text = response if isinstance(response, str) else str(response)
    now2 = datetime.now(timezone.utc).isoformat()
    ai_msg = {
        "id": str(uuid.uuid4()),
        "report_id": report_id,
        "user_id": current_user.id,
        "role": "assistant",
        "text": reply_text.strip(),
        "created_at": now2,
    }
    await db.chat_messages.insert_one(ai_msg)
    ai_msg.pop("_id", None)

    return {"user_msg": user_msg, "reply": ai_msg}


# ---------------- Admin Endpoints ----------------
class CreditAdjustIn(BaseModel):
    delta: int
    reason: str = "admin_adjustment"


@api_router.get("/admin/stats")
async def admin_stats(_: UserOut = Depends(get_current_admin)):
    total_users = await db.users.count_documents({})
    total_reports = await db.reports.count_documents({})
    total_favs = await db.favorites.count_documents({})
    total_chats = await db.chat_messages.count_documents({})
    stripe_fulfilled = await db.stripe_sessions.count_documents({"fulfilled": True})
    stripe_revenue_cents = 0
    async for s in db.stripe_sessions.find({"fulfilled": True}, {"_id": 0, "amount_cents": 1}):
        stripe_revenue_cents += int(s.get("amount_cents", 0))
    iap_count = await db.iap_receipts.count_documents({})
    ad_rewards = await db.ad_rewards.count_documents({})

    # last 7 days analyses
    from datetime import timedelta as _td
    week_ago = (datetime.now(timezone.utc) - _td(days=7)).isoformat()
    week_analyses = await db.reports.count_documents({"created_at": {"$gte": week_ago}})

    return {
        "total_users": total_users,
        "total_reports": total_reports,
        "week_analyses": week_analyses,
        "total_favorites": total_favs,
        "total_chats": total_chats,
        "ad_rewards": ad_rewards,
        "stripe_fulfilled_count": stripe_fulfilled,
        "stripe_revenue_usd": round(stripe_revenue_cents / 100.0, 2),
        "iap_count": iap_count,
    }


@api_router.get("/admin/users")
async def admin_users(
    skip: int = 0,
    limit: int = 50,
    _: UserOut = Depends(get_current_admin),
):
    limit = max(1, min(limit, 200))
    total = await db.users.count_documents({})
    cursor = db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).skip(skip).limit(limit)
    items = []
    async for u in cursor:
        report_count = await db.reports.count_documents({"user_id": u["id"]})
        items.append({
            "id": u["id"],
            "email": u["email"],
            "full_name": u.get("full_name"),
            "query_credits": int(u.get("query_credits", 0)),
            "is_admin": bool(u.get("is_admin", False)),
            "created_at": u.get("created_at"),
            "report_count": report_count,
        })
    return {"total": total, "skip": skip, "limit": limit, "items": items}


@api_router.post("/admin/users/{user_id}/credits")
async def admin_adjust_credits(
    user_id: str,
    data: CreditAdjustIn,
    admin: UserOut = Depends(get_current_admin),
):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(404, "Kullanıcı bulunamadı")
    await db.users.update_one({"id": user_id}, {"$inc": {"query_credits": data.delta}})
    await db.credit_txns.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "delta": data.delta,
        "reason": f"admin:{data.reason}",
        "meta": {"admin_id": admin.id},
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    fresh = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return {"ok": True, "user_credits": int(fresh.get("query_credits", 0))}


@api_router.get("/admin/txns")
async def admin_recent_txns(
    limit: int = 50,
    _: UserOut = Depends(get_current_admin),
):
    limit = max(1, min(limit, 200))
    cursor = db.credit_txns.find({}, {"_id": 0}).sort("created_at", -1).limit(limit)
    return {"items": await cursor.to_list(limit)}


@api_router.get("/admin/payments")
async def admin_payments(_: UserOut = Depends(get_current_admin)):
    stripe_docs = await db.stripe_sessions.find({}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    iap_docs = await db.iap_receipts.find({}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    return {"stripe": stripe_docs, "iap": iap_docs}


@api_router.get("/")
async def root():
    return {"message": "AI Oto Analiz API", "version": "2.0"}


# ---------------- OG Card (WhatsApp / Social Preview) ----------------
@app.get("/og/{report_id}", response_class=HTMLResponse)
async def og_card_html(report_id: str, request: Request):
    """Public HTML page with og: meta tags for WhatsApp / social link preview."""
    doc = await db.reports.find_one({"id": report_id}, {"_id": 0})
    if not doc:
        return HTMLResponse("<h1>Rapor bulunamadı</h1>", status_code=404)
    base = str(request.base_url).rstrip("/")
    og_img = f"{base}/og/{report_id}/card.png"
    title = f"{doc['marka']} {doc['model']} {doc['yil']} · Ekspertiz Skoru {doc.get('guven_skoru', 0)}/100"
    km = doc.get("kilometre")
    km_txt = f"{int(km):,} km · ".replace(",", ".") if km else ""
    desc = f"{km_txt}Fiyat-Performans: {doc.get('fiyat_performans_skoru', 0)}/100 · AI Oto Analiz raporu"
    html = f"""<!DOCTYPE html><html lang="tr"><head>
<meta charset="utf-8" />
<meta property="og:type" content="website" />
<meta property="og:title" content="{title}" />
<meta property="og:description" content="{desc}" />
<meta property="og:image" content="{og_img}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{title}" />
<meta name="twitter:description" content="{desc}" />
<meta name="twitter:image" content="{og_img}" />
<title>{title}</title>
<style>body{{background:#0A1628;color:#F5F7FA;font-family:-apple-system,sans-serif;padding:32px;text-align:center;}}
img{{max-width:600px;width:100%;border-radius:12px;}}h1{{color:#FFC93C;}}</style>
</head><body>
<h1>{title}</h1>
<p>{desc}</p>
<img src="{og_img}" alt="{title}" />
</body></html>"""
    return HTMLResponse(html)


@app.get("/og/{report_id}/card.png")
async def og_card_png(report_id: str):
    """Generates a 1200x630 PNG card server-side using Pillow."""
    doc = await db.reports.find_one({"id": report_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Rapor bulunamadı")
    from PIL import Image, ImageDraw, ImageFont
    import io as _io

    W, H = 1200, 630
    img = Image.new("RGB", (W, H), color=(10, 22, 40))
    d = ImageDraw.Draw(img)
    # accent bars
    d.rectangle([0, 0, W, 8], fill=(255, 201, 60))
    d.rectangle([0, H - 8, W, H], fill=(255, 201, 60))

    def font(size):
        for p in [
            "/app/frontend/assets/fonts/Poppins-SemiBold.ttf",
            "/app/frontend/assets/fonts/Poppins-Medium.ttf",
            "/app/frontend/assets/fonts/Poppins-Regular.ttf",
        ]:
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
        return ImageFont.load_default()

    d.text((60, 60), "AI OTO ANALİZ", fill=(255, 201, 60), font=font(30))
    d.text((60, 110), f"{doc['marka']} {doc['model']}", fill=(255, 255, 255), font=font(80))
    d.text((60, 210), f"{doc['yil']}", fill=(199, 210, 224), font=font(48))
    km = doc.get("kilometre")
    if km:
        km_str = f"{int(km):,} km".replace(",", ".")
        d.text((60, 280), km_str, fill=(143, 160, 184), font=font(36))

    # Score box (right)
    score = int(doc.get("guven_skoru", 0))
    box_x, box_y, box_w, box_h = 800, 120, 340, 340
    color = (74, 222, 128) if score >= 70 else (255, 201, 60) if score >= 45 else (248, 113, 113)
    d.rectangle([box_x, box_y, box_x + box_w, box_y + box_h], outline=color, width=6)
    d.text((box_x + 60, box_y + 20), "GÜVEN SKORU", fill=(199, 210, 224), font=font(24))
    d.text((box_x + 60, box_y + 70), str(score), fill=color, font=font(180))
    d.text((box_x + 250, box_y + 240), "/100", fill=(143, 160, 184), font=font(28))

    # bottom summary
    fp = int(doc.get("fiyat_performans_skoru", 0))
    d.text((60, 480), f"FIYAT-PERFORMANS  {fp}/100", fill=(255, 201, 60), font=font(28))
    d.text((60, 540), "Detaylı ekspertiz raporunu AI Oto Analiz'de görüntüle", fill=(199, 210, 224), font=font(22))

    buf = _io.BytesIO()
    img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_db():
    await db.users.create_index("email", unique=True)
    await db.reports.create_index([("user_id", 1), ("created_at", -1)])
    await db.favorites.create_index([("user_id", 1), ("report_id", 1)], unique=True)
    await db.ad_rewards.create_index("ad_session_id", unique=True)
    await db.iap_receipts.create_index("receipt", unique=True)
    await db.stripe_sessions.create_index("session_id", unique=True)
    await db.chat_messages.create_index([("report_id", 1), ("created_at", 1)])
    # Idempotent admin seeding
    if ADMIN_EMAIL and ADMIN_PASSWORD:
        existing = await db.users.find_one({"email": ADMIN_EMAIL})
        if existing:
            update = {"$set": {"is_admin": True}}
            if ADMIN_RESET_PASSWORD:
                update["$set"]["password_hash"] = hash_password(ADMIN_PASSWORD)
            await db.users.update_one({"id": existing["id"]}, update)
            logger.info(f"Admin ensured: {ADMIN_EMAIL}")
        else:
            admin_id = str(uuid.uuid4())
            await db.users.insert_one({
                "id": admin_id,
                "email": ADMIN_EMAIL,
                "full_name": "Admin",
                "password_hash": hash_password(ADMIN_PASSWORD),
                "query_credits": 0,
                "is_admin": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info(f"Admin seeded: {ADMIN_EMAIL}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
