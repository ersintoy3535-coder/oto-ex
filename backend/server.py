from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import logging
import uuid
import re
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
JWT_ALG = "HS256"
JWT_EXPIRE_DAYS = 30

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI()
api_router = APIRouter(prefix="/api")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
DUMMY_HASH = pwd_context.hash("dummy-password-for-timing-attack")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

logger = logging.getLogger("oto_ekspertiz")
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')


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


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class AnalyzeIn(BaseModel):
    marka: str
    model: str
    yil: int
    kilometre: Optional[int] = None
    istenilen_fiyat: Optional[float] = None  # user's asking price to evaluate


class TrafficLightItem(BaseModel):
    baslik: str
    aciklama: str
    seviye: str  # "green" | "yellow" | "red"


class MaintenanceItem(BaseModel):
    isim: str
    periyot: str
    tahmini_maliyet_tl: str


class AnalysisReport(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    marka: str
    model: str
    yil: int
    kilometre: Optional[int] = None
    istenilen_fiyat: Optional[float] = None
    guven_skoru: int  # 0-100
    ozet: str
    fiyat_min_tl: float
    fiyat_max_tl: float
    fiyat_yorumu: str
    yakit_100km_litre: float
    aylik_yakit_tahmini_tl: float
    mekanik_sorunlar: List[TrafficLightItem]
    elektrik_sorunlar: List[TrafficLightItem]
    kaporta_ic_mekan: List[TrafficLightItem]
    periyodik_bakim: List[MaintenanceItem]
    olasi_masraflar: List[TrafficLightItem]
    alim_tavsiyesi: str
    dikkat_edilecek_noktalar: List[str]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_id: Optional[str] = None


class CompareIn(BaseModel):
    car1_id: str
    car2_id: str


# ---------------- Helpers ----------------
def hash_password(pw: str) -> str:
    return pwd_context.hash(pw)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRE_DAYS)
    payload = {"sub": user_id, "exp": int(exp.timestamp())}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


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
    return UserOut(id=user["id"], email=user["email"], full_name=user.get("full_name"))


def strip_json_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        # remove leading fence like ```json
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


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
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    token = create_access_token(user_id)
    return TokenOut(
        access_token=token,
        user=UserOut(id=user_id, email=data.email.lower(), full_name=data.full_name),
    )


@api_router.post("/auth/login", response_model=TokenOut)
async def login(data: LoginIn):
    user = await db.users.find_one({"email": data.email.lower()})
    if not user:
        verify_password(data.password, DUMMY_HASH)
        raise HTTPException(401, "E-posta veya şifre hatalı")
    if not verify_password(data.password, user["password_hash"]):
        raise HTTPException(401, "E-posta veya şifre hatalı")
    token = create_access_token(user["id"])
    return TokenOut(
        access_token=token,
        user=UserOut(id=user["id"], email=user["email"], full_name=user.get("full_name")),
    )


@api_router.get("/auth/me", response_model=UserOut)
async def me(current_user: UserOut = Depends(get_current_user)):
    return current_user


# ---------------- AI Analysis ----------------
SYSTEM_PROMPT = """Sen bir Türk otomotiv ekspertiz uzmanısın. 20+ yıllık deneyimin var. Kullanıcı sana bir aracın marka, model, yıl ve opsiyonel kilometre bilgisini verecek. Sen o araca özel DETAYLI ve GERÇEK bir analiz yapacaksın.

Cevabını SADECE geçerli JSON formatında ver, başka hiçbir metin ekleme. JSON yapısı ŞU olmalı:

{
  "guven_skoru": <0-100 arası tam sayı, aracın genel güvenilirlik puanı>,
  "ozet": "<2-3 cümlelik genel özet>",
  "fiyat_min_tl": <Türkiye piyasasında minimum tahmini TL fiyatı, sayı>,
  "fiyat_max_tl": <Türkiye piyasasında maksimum tahmini TL fiyatı, sayı>,
  "fiyat_yorumu": "<eğer kullanıcı istenilen fiyat verdiyse UYGUN/PAHALI/UCUZ olarak yorumla, vermediyse genel yorum>",
  "yakit_100km_litre": <100km başına ortalama yakıt tüketimi litre, ondalık sayı>,
  "aylik_yakit_tahmini_tl": <ayda 1500km kullanım varsayımıyla TL, sayı>,
  "mekanik_sorunlar": [
    {"baslik": "<sorun adı>", "aciklama": "<detay>", "seviye": "green|yellow|red"}
  ],
  "elektrik_sorunlar": [
    {"baslik": "...", "aciklama": "...", "seviye": "green|yellow|red"}
  ],
  "kaporta_ic_mekan": [
    {"baslik": "...", "aciklama": "...", "seviye": "green|yellow|red"}
  ],
  "periyodik_bakim": [
    {"isim": "<bakım adı>", "periyot": "<örn: 10.000 km>", "tahmini_maliyet_tl": "<örn: 3000-5000 TL>"}
  ],
  "olasi_masraflar": [
    {"baslik": "<masraf>", "aciklama": "<tahmini TL değeri ve detay>", "seviye": "green|yellow|red"}
  ],
  "alim_tavsiyesi": "<KESİNLİKLE ALIN / DİKKATLİ ALIN / ALMAYIN gibi net tavsiye + gerekçe>",
  "dikkat_edilecek_noktalar": ["<madde 1>", "<madde 2>", "..."]
}

Seviyeler:
- green: sorun yok / güvenli
- yellow: dikkat gerektirir / orta risk
- red: ciddi kronik sorun / yüksek risk

Her kategoride EN AZ 3 madde olsun. Türkçe cevap ver, para birimi TL. Fiyatları güncel 2026 Türkiye piyasasına göre ver."""


@api_router.post("/analyze", response_model=AnalysisReport)
async def analyze_vehicle(data: AnalyzeIn, current_user: UserOut = Depends(get_current_user)):
    prompt = f"""Araç bilgileri:
- Marka: {data.marka}
- Model: {data.model}
- Yıl: {data.yil}"""
    if data.kilometre is not None:
        prompt += f"\n- Kilometre: {data.kilometre} km"
    if data.istenilen_fiyat is not None:
        prompt += f"\n- Satıcının istediği fiyat: {data.istenilen_fiyat} TL"
    prompt += "\n\nBu araca özel detaylı ekspertiz analizini JSON formatında ver."

    session_id = f"analyze-{uuid.uuid4()}"
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=SYSTEM_PROMPT,
    ).with_model("gemini", "gemini-2.5-pro")

    try:
        response = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        logger.exception("LLM error")
        raise HTTPException(502, f"AI analiz servisi hata verdi: {str(e)}")

    raw = strip_json_fence(response if isinstance(response, str) else str(response))
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        # try to extract first { ... }
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            logger.error(f"Failed to parse JSON: {raw[:500]}")
            raise HTTPException(502, "AI cevabı ayrıştırılamadı")
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError:
            raise HTTPException(502, "AI cevabı geçersiz JSON")

    report = AnalysisReport(
        marka=data.marka,
        model=data.model,
        yil=data.yil,
        kilometre=data.kilometre,
        istenilen_fiyat=data.istenilen_fiyat,
        guven_skoru=int(parsed.get("guven_skoru", 50)),
        ozet=parsed.get("ozet", ""),
        fiyat_min_tl=float(parsed.get("fiyat_min_tl", 0)),
        fiyat_max_tl=float(parsed.get("fiyat_max_tl", 0)),
        fiyat_yorumu=parsed.get("fiyat_yorumu", ""),
        yakit_100km_litre=float(parsed.get("yakit_100km_litre", 0)),
        aylik_yakit_tahmini_tl=float(parsed.get("aylik_yakit_tahmini_tl", 0)),
        mekanik_sorunlar=[TrafficLightItem(**x) for x in parsed.get("mekanik_sorunlar", [])],
        elektrik_sorunlar=[TrafficLightItem(**x) for x in parsed.get("elektrik_sorunlar", [])],
        kaporta_ic_mekan=[TrafficLightItem(**x) for x in parsed.get("kaporta_ic_mekan", [])],
        periyodik_bakim=[MaintenanceItem(**x) for x in parsed.get("periyodik_bakim", [])],
        olasi_masraflar=[TrafficLightItem(**x) for x in parsed.get("olasi_masraflar", [])],
        alim_tavsiyesi=parsed.get("alim_tavsiyesi", ""),
        dikkat_edilecek_noktalar=parsed.get("dikkat_edilecek_noktalar", []),
        user_id=current_user.id,
    )
    # persist to history
    doc = report.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.reports.insert_one(doc)
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
    # compute winners
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


@api_router.get("/")
async def root():
    return {"message": "OtoEkspertiz AI API", "version": "1.0"}


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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
