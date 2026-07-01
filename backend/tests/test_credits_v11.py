"""Tests for OtoEkspertiz AI monetization v1.1 endpoints.

Covers: signup credits, /credits/me, /credits/packages, reward-ad (idempotent),
IAP verify (idempotent), Stripe checkout create + status (unpaid), and analyze
with 0 credits (402) + decrement on success.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://auto-assess-6.preview.emergentagent.com",
).rstrip("/")


# ---------- Fresh user fixture (isolated credit state) ----------
@pytest.fixture(scope="module")
def fresh_user():
    email = f"TEST_credit_{uuid.uuid4().hex[:10]}@oto.com"
    password = "pw12345"
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": password, "full_name": "Credit Tester"},
        timeout=15,
    )
    assert r.status_code == 201, r.text
    data = r.json()
    return {
        "email": email,
        "password": password,
        "token": data["access_token"],
        "user": data["user"],
        "headers": {
            "Authorization": f"Bearer {data['access_token']}",
            "Content-Type": "application/json",
        },
    }


@pytest.fixture(scope="module")
def existing_user_headers():
    """Existing test user with credits from prior iterations."""
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "test@oto.com", "password": "test123"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- Signup free credits ----------
class TestSignupCredits:
    def test_register_grants_3_free_credits(self, fresh_user):
        assert fresh_user["user"].get("query_credits") == 3, fresh_user["user"]

    def test_credits_me_returns_balance(self, fresh_user):
        r = requests.get(f"{BASE_URL}/api/credits/me", headers=fresh_user["headers"], timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "credits" in body and isinstance(body["credits"], int)
        assert body["credits"] == 3


# ---------- Packages ----------
class TestPackages:
    def test_packages_shape(self, existing_user_headers):
        r = requests.get(f"{BASE_URL}/api/credits/packages", headers=existing_user_headers, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "packages" in data
        pkgs = {p["id"]: p for p in data["packages"]}
        assert set(pkgs.keys()) == {"small", "medium", "large"}
        assert pkgs["small"]["credits"] == 3 and pkgs["small"]["price_usd_cents"] == 100
        assert pkgs["medium"]["credits"] == 10 and pkgs["medium"]["price_usd_cents"] == 300
        assert pkgs["large"]["credits"] == 50 and pkgs["large"]["price_usd_cents"] == 1000

    def test_packages_no_auth_ok(self):
        # /credits/packages is not protected in server.py (no Depends). Verify.
        r = requests.get(f"{BASE_URL}/api/credits/packages", timeout=10)
        assert r.status_code == 200


# ---------- Rewarded Ad (idempotent) ----------
class TestRewardAd:
    def test_reward_ad_credits_and_idempotent(self, fresh_user):
        headers = fresh_user["headers"]

        # Baseline
        before = requests.get(f"{BASE_URL}/api/credits/me", headers=headers, timeout=10).json()["credits"]

        session_id = f"adsess-{uuid.uuid4().hex}"
        r1 = requests.post(
            f"{BASE_URL}/api/credits/reward-ad",
            headers=headers,
            json={"ad_session_id": session_id},
            timeout=10,
        )
        assert r1.status_code == 200, r1.text
        b1 = r1.json()
        assert b1["credited"] == 1
        assert b1["balance"] == before + 1

        # Verify persisted via GET
        after = requests.get(f"{BASE_URL}/api/credits/me", headers=headers, timeout=10).json()["credits"]
        assert after == before + 1

        # Idempotent replay
        r2 = requests.post(
            f"{BASE_URL}/api/credits/reward-ad",
            headers=headers,
            json={"ad_session_id": session_id},
            timeout=10,
        )
        assert r2.status_code == 200
        assert r2.json()["credited"] == 0

        # Balance unchanged after replay
        again = requests.get(f"{BASE_URL}/api/credits/me", headers=headers, timeout=10).json()["credits"]
        assert again == after

    def test_reward_ad_rejects_short_session_id(self, fresh_user):
        r = requests.post(
            f"{BASE_URL}/api/credits/reward-ad",
            headers=fresh_user["headers"],
            json={"ad_session_id": "abc"},
            timeout=10,
        )
        assert r.status_code == 400


# ---------- IAP (mock) verify ----------
class TestIapVerify:
    def test_iap_verify_credits_small_and_idempotent(self, fresh_user):
        headers = fresh_user["headers"]
        before = requests.get(f"{BASE_URL}/api/credits/me", headers=headers, timeout=10).json()["credits"]

        receipt = f"mock-iap-{uuid.uuid4().hex}"
        r1 = requests.post(
            f"{BASE_URL}/api/iap/verify",
            headers=headers,
            json={"package_id": "small", "platform": "ios", "receipt": receipt},
            timeout=10,
        )
        assert r1.status_code == 200, r1.text
        b1 = r1.json()
        assert b1["credited"] == 3  # small pkg
        assert b1["balance"] == before + 3

        after = requests.get(f"{BASE_URL}/api/credits/me", headers=headers, timeout=10).json()["credits"]
        assert after == before + 3

        # Idempotent replay
        r2 = requests.post(
            f"{BASE_URL}/api/iap/verify",
            headers=headers,
            json={"package_id": "small", "platform": "ios", "receipt": receipt},
            timeout=10,
        )
        assert r2.status_code == 200
        assert r2.json()["credited"] == 0

    def test_iap_verify_invalid_package(self, fresh_user):
        r = requests.post(
            f"{BASE_URL}/api/iap/verify",
            headers=fresh_user["headers"],
            json={"package_id": "xxl", "platform": "ios", "receipt": "abcdefghij"},
            timeout=10,
        )
        assert r.status_code == 400


# ---------- Stripe Checkout ----------
class TestStripeCheckout:
    session_id = None

    def test_create_checkout_small(self, existing_user_headers):
        r = requests.post(
            f"{BASE_URL}/api/checkout/create",
            headers=existing_user_headers,
            json={"package_id": "small", "origin_url": BASE_URL},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("session_id", "").startswith("cs_"), data
        assert data.get("url", "").startswith("https://"), data
        TestStripeCheckout.session_id = data["session_id"]

    def test_checkout_status_unpaid(self, existing_user_headers):
        assert TestStripeCheckout.session_id, "create test must run first"
        r = requests.get(
            f"{BASE_URL}/api/checkout/status/{TestStripeCheckout.session_id}",
            headers=existing_user_headers,
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["paid"] is False
        assert body["credited_now"] == 0

    def test_create_checkout_invalid_pkg(self, existing_user_headers):
        r = requests.post(
            f"{BASE_URL}/api/checkout/create",
            headers=existing_user_headers,
            json={"package_id": "nope", "origin_url": BASE_URL},
            timeout=10,
        )
        assert r.status_code == 400


# ---------- Analyze credit interaction ----------
class TestAnalyzeCredits:
    def test_analyze_deducts_1_credit_on_success(self, fresh_user):
        headers = fresh_user["headers"]
        before = requests.get(f"{BASE_URL}/api/credits/me", headers=headers, timeout=10).json()["credits"]
        assert before >= 1, f"fresh user should have credits, got {before}"

        r = requests.post(
            f"{BASE_URL}/api/analyze",
            headers=headers,
            json={"marka": "Toyota", "model": "Corolla", "yil": 2018, "kilometre": 90000},
            timeout=90,
        )
        assert r.status_code == 200, r.text[:500]
        body = r.json()
        # Real Gemini call → structured report
        assert isinstance(body.get("guven_skoru"), int)
        assert body.get("marka") == "Toyota"
        assert len(body.get("mekanik_sorunlar", [])) >= 1

        after = requests.get(f"{BASE_URL}/api/credits/me", headers=headers, timeout=10).json()["credits"]
        assert after == before - 1

    def test_analyze_402_when_zero_credits(self):
        """Register fresh user (3 credits), drain to 0 via analyze, expect 402."""
        drain_email = f"TEST_drain_{uuid.uuid4().hex[:10]}@oto.com"
        reg = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": drain_email, "password": "pw12345"},
            timeout=15,
        ).json()
        drain_headers = {
            "Authorization": f"Bearer {reg['access_token']}",
            "Content-Type": "application/json",
        }
        # Drain 3 credits with 3 real analyze calls
        for i in range(3):
            r = requests.post(
                f"{BASE_URL}/api/analyze",
                headers=drain_headers,
                json={"marka": "Fiat", "model": "Egea", "yil": 2019},
                timeout=120,
            )
            assert r.status_code == 200, f"drain call {i}: {r.status_code} {r.text[:300]}"

        # Confirm balance is 0
        bal = requests.get(f"{BASE_URL}/api/credits/me", headers=drain_headers, timeout=10).json()["credits"]
        assert bal == 0

        # Next analyze must be 402 with detail.code=insufficient_credits
        r = requests.post(
            f"{BASE_URL}/api/analyze",
            headers=drain_headers,
            json={"marka": "Fiat", "model": "Egea", "yil": 2019},
            timeout=30,
        )
        assert r.status_code == 402, r.text[:400]
        body = r.json()
        assert body.get("detail", {}).get("code") == "insufficient_credits", body
