"""OtoEkspertiz AI backend integration tests."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://auto-assess-6.preview.emergentagent.com").rstrip("/")

TEST_EMAIL = "test@oto.com"
TEST_PASSWORD = "test123"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    if r.status_code != 200:
        # Register if needed
        rr = requests.post(f"{BASE_URL}/api/auth/register", json={"email": TEST_EMAIL, "password": TEST_PASSWORD, "full_name": "Test User"})
        assert rr.status_code in (201, 409)
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Auth ----------
class TestAuth:
    def test_register_new_user(self):
        email = f"TEST_{uuid.uuid4().hex[:8]}@oto.com"
        r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "pw12345", "full_name": "Reg Test"})
        assert r.status_code == 201, r.text
        data = r.json()
        assert "access_token" in data and data["user"]["email"] == email

    def test_register_duplicate(self):
        r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
        assert r.status_code == 409

    def test_login_bad_password(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": "wrongpass"})
        assert r.status_code == 401

    def test_me_authenticated(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["email"] == TEST_EMAIL

    def test_me_unauthenticated(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401


# ---------- Analyze (real Gemini call) ----------
@pytest.fixture(scope="session")
def analyzed_report(auth_headers):
    payload = {"marka": "Toyota", "model": "Corolla", "yil": 2018, "kilometre": 120000}
    r = requests.post(f"{BASE_URL}/api/analyze", headers=auth_headers, json=payload, timeout=180)
    assert r.status_code == 200, f"Analyze failed: {r.status_code} {r.text[:300]}"
    return r.json()


class TestAnalyze:
    def test_analyze_full_structure(self, analyzed_report):
        d = analyzed_report
        required = [
            "id", "marka", "model", "yil", "guven_skoru", "ozet",
            "fiyat_min_tl", "fiyat_max_tl", "fiyat_yorumu",
            "yakit_100km_litre", "aylik_yakit_tahmini_tl",
            "mekanik_sorunlar", "elektrik_sorunlar", "kaporta_ic_mekan",
            "periyodik_bakim", "olasi_masraflar",
            "alim_tavsiyesi", "dikkat_edilecek_noktalar",
        ]
        for k in required:
            assert k in d, f"Missing key: {k}"
        assert 0 <= d["guven_skoru"] <= 100
        assert d["fiyat_max_tl"] >= d["fiyat_min_tl"] > 0
        assert isinstance(d["mekanik_sorunlar"], list) and len(d["mekanik_sorunlar"]) >= 1
        # traffic-light seviye validation
        for item in d["mekanik_sorunlar"] + d["elektrik_sorunlar"] + d["kaporta_ic_mekan"]:
            assert item["seviye"] in ("green", "yellow", "red")
        assert isinstance(d["periyodik_bakim"], list) and len(d["periyodik_bakim"]) >= 1
        for m in d["periyodik_bakim"]:
            assert "isim" in m and "periyot" in m and "tahmini_maliyet_tl" in m

    def test_analyze_unauthorized(self):
        r = requests.post(f"{BASE_URL}/api/analyze", json={"marka": "X", "model": "Y", "yil": 2020})
        assert r.status_code == 401


# ---------- History / Reports ----------
class TestHistoryReports:
    def test_history_contains_analyzed(self, auth_headers, analyzed_report):
        r = requests.get(f"{BASE_URL}/api/history", headers=auth_headers)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        ids = [x["id"] for x in items]
        assert analyzed_report["id"] in ids

    def test_get_report_by_id(self, auth_headers, analyzed_report):
        r = requests.get(f"{BASE_URL}/api/reports/{analyzed_report['id']}", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["id"] == analyzed_report["id"]

    def test_get_report_not_found(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/reports/nonexistent-id", headers=auth_headers)
        assert r.status_code == 404


# ---------- Favorites ----------
class TestFavorites:
    def test_favorite_flow(self, auth_headers, analyzed_report):
        rid = analyzed_report["id"]
        # add
        r = requests.post(f"{BASE_URL}/api/favorites/{rid}", headers=auth_headers)
        assert r.status_code == 200 and r.json().get("ok") is True
        # ids
        r = requests.get(f"{BASE_URL}/api/favorites/ids", headers=auth_headers)
        assert r.status_code == 200 and rid in r.json()["ids"]
        # list
        r = requests.get(f"{BASE_URL}/api/favorites", headers=auth_headers)
        assert r.status_code == 200
        assert any(x["id"] == rid for x in r.json())
        # remove
        r = requests.delete(f"{BASE_URL}/api/favorites/{rid}", headers=auth_headers)
        assert r.status_code == 200
        # verify removed
        r = requests.get(f"{BASE_URL}/api/favorites/ids", headers=auth_headers)
        assert rid not in r.json()["ids"]

    def test_favorite_nonexistent_report(self, auth_headers):
        r = requests.post(f"{BASE_URL}/api/favorites/does-not-exist", headers=auth_headers)
        assert r.status_code == 404


# ---------- Compare ----------
class TestCompare:
    @pytest.fixture(scope="class")
    def second_report(self, auth_headers):
        payload = {"marka": "Honda", "model": "Civic", "yil": 2019, "kilometre": 90000}
        r = requests.post(f"{BASE_URL}/api/analyze", headers=auth_headers, json=payload, timeout=180)
        assert r.status_code == 200, r.text
        return r.json()

    def test_compare_two_reports(self, auth_headers, analyzed_report, second_report):
        r = requests.post(f"{BASE_URL}/api/compare", headers=auth_headers,
                          json={"car1_id": analyzed_report["id"], "car2_id": second_report["id"]})
        assert r.status_code == 200, r.text
        d = r.json()
        assert "car1" in d and "car2" in d and "winners" in d
        for k in ("guven_skoru", "yakit_100km_litre", "fiyat_min_tl", "aylik_yakit_tahmini_tl"):
            assert d["winners"][k] in ("car1", "car2", "tie")

    def test_compare_invalid(self, auth_headers, analyzed_report):
        r = requests.post(f"{BASE_URL}/api/compare", headers=auth_headers,
                          json={"car1_id": analyzed_report["id"], "car2_id": "invalid"})
        assert r.status_code == 404
