# Native Integrations — AdMob & IAP Swap Guide

Şu an `credits.tsx` içindeki reklam ve mağaza satın alma akışları **MOCK** durumda: sadece backend endpoint'lerini çağırıyor. Aşağıdaki gerçek entegrasyonlar **native build** oluşturulduktan sonra devreye alınmalı (Expo Go'da native modüller çalışmaz).

---

## 1) Google AdMob Ödüllü Reklam

### Kurulum (native build)
```bash
yarn expo install react-native-google-mobile-ads
```

`app.json` içine ekle:
```json
"plugins": [
  ["react-native-google-mobile-ads", {
    "androidAppId": "ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY",
    "iosAppId":     "ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY"
  }]
]
```

### Test Ad Unit ID'leri (Geliştirme)
- **Android rewarded:** `ca-app-pub-3940256099942544/5224354917`
- **iOS rewarded:** `ca-app-pub-3940256099942544/1712485313`

### `credits.tsx` içindeki `watchAd` fonksiyonunu şununla değiştir:

```tsx
import { RewardedAd, RewardedAdEventType, TestIds } from 'react-native-google-mobile-ads';

const rewardedAd = RewardedAd.createForAdRequest(
  __DEV__ ? TestIds.REWARDED : 'ca-app-pub-XXXXX/YYYYY',
  { requestNonPersonalizedAdsOnly: true },
);

const watchAd = async () => {
  setAdBusy(true);
  const rewarded = await new Promise<boolean>((resolve) => {
    const unsubLoaded = rewardedAd.addAdEventListener(RewardedAdEventType.LOADED, () => rewardedAd.show());
    const unsubEarned = rewardedAd.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      unsubLoaded(); unsubEarned();
      resolve(true);
    });
    rewardedAd.load();
    setTimeout(() => resolve(false), 30000); // timeout guard
  });

  if (rewarded) {
    const ad_session_id = genSessionId();
    const res = await apiFetch('/credits/reward-ad', {
      method: 'POST', body: JSON.stringify({ ad_session_id }),
    }, token);
    setCredits(res.balance);
  }
  setAdBusy(false);
};
```

---

## 2) Native IAP (App Store + Google Play Billing)

### Kurulum
```bash
yarn expo install expo-iap    # tercih edilen
# veya: yarn add react-native-iap
```

### Store setup
- **iOS App Store Connect:** `com.otoekspertiz.credits3`, `com.otoekspertiz.credits10`, `com.otoekspertiz.credits50` ürünlerini "Consumable" olarak ekle
- **Google Play Console:** Aynı SKU'ları "Managed product" olarak ekle
- Development test için Sandbox test hesabı gerekli

### `credits.tsx` içindeki `buyIAP` fonksiyonunu şununla değiştir:

```tsx
import { requestPurchase, useIAP } from 'expo-iap';

const SKU_MAP: Record<string, string> = {
  small:  'com.otoekspertiz.credits3',
  medium: 'com.otoekspertiz.credits10',
  large:  'com.otoekspertiz.credits50',
};

const { connected, products, getProducts, finishTransaction } = useIAP();

useEffect(() => {
  if (connected) getProducts(Object.values(SKU_MAP));
}, [connected]);

const buyIAP = async (pkg: Pkg) => {
  setBuyingId(`iap-${pkg.id}`);
  try {
    const purchase = await requestPurchase({ sku: SKU_MAP[pkg.id] });
    const receipt = Platform.OS === 'ios'
      ? purchase.transactionReceipt      // iOS: base64 receipt
      : purchase.purchaseToken;          // Android: purchase token
    const res = await apiFetch('/iap/verify', {
      method: 'POST',
      body: JSON.stringify({ package_id: pkg.id, platform: Platform.OS, receipt }),
    }, token);
    await finishTransaction(purchase, true); // consume
    setCredits(res.balance);
  } finally {
    setBuyingId(null);
  }
};
```

### Backend'i güçlendir (`/api/iap/verify`)
Şu an sadece receipt'in boş olmadığını kontrol ediyor. Production için:
- **iOS:** Apple `verifyReceipt` API veya App Store Server API (JWT ile)
- **Android:** Google Play Developer API `purchases.products.get` (Service Account credentials ile)

---

## 3) Stripe Checkout
Zaten native + web'de çalışır (WebBrowser tabanlı). Değiştirmeye gerek yok. Production için:
- Kendi Stripe hesabından live key al → `STRIPE_API_KEY` env'ini güncelle
- Webhook endpoint (`/api/checkout/webhook`) opsiyonel — şu an session polling ile idempotent fulfillment yapılıyor
