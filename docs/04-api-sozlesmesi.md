# 04 · API Sözleşmesi

Frontend bu dokümana göre yazılıyor. Buradaki bir endpoint'in şeklini değiştirmek
**kırıcı değişikliktir** — önce bu dosya güncellenir, sonra kod.

Base URL: `/v1`. Mevcut auth modülü henüz `/auth` altında (prefix'siz); Faz 0'da
`/v1/auth` altına taşınacak.

## Ortak kurallar

### Kimlik doğrulama

```
Authorization: Bearer <access_token>
```

- **Access token:** 1 saat geçerli, `Authorization` header'ında taşınır
- **Refresh token:** 30 gün geçerli, **HttpOnly cookie**'de saklanır (XSS koruması)
- 401 alan istemci `POST /v1/auth/refresh` çağırıp orijinal isteği bir kez tekrarlar (H3)
- Refresh de başarısızsa kullanıcı giriş sayfasına yönlendirilir

### Hata formatı

Tüm hatalar tek şekilde döner. `HttpExceptionFilter` bunu garanti eder.

```json
{
  "error": "MACHINE_READABLE_CODE",
  "message": "Kullanıcıya gösterilecek Türkçe açıklama",
  "details": { }
}
```

`error` kodu makine tarafından okunur ve **değişmez**. `message` Türkçedir ve doğrudan
kullanıcıya gösterilir. `details` opsiyoneldir; alan bazlı doğrulama hataları burada.

### Durum kodları

| Kod | Ne zaman |
|---|---|
| 200 | Başarılı okuma / güncelleme |
| 201 | Kayıt oluşturuldu |
| 202 | Kabul edildi ama işlem tamamlanmadı (uzman onayı bekliyor — A2) |
| 400 | Doğrulama hatası |
| 401 | Token yok / geçersiz / süresi dolmuş |
| 403 | Yetki yok · tesis doğrulanmamış · iletişim bilgisi henüz kapalı |
| 404 | Kayıt yok |
| 409 | Çakışma — mükerrer kayıt, geçersiz durum geçişi, stok yarışı |
| 422 | İş kuralı ihlali (ağırlık toplamı ≠ 1 gibi) |
| 429 | Rate limit |
| 503 | Bağımlı servis erişilemez (DB, AI) |

### Sık kullanılan hata kodları

| `error` | Durum | Nerede |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Her yerde |
| `TAX_ID_ALREADY_EXISTS` | 409 | S1 |
| `EMAIL_ALREADY_EXISTS` | 409 | S1 |
| `FACILITY_NOT_VERIFIED` | 403 | S1, S2 |
| `POSSIBLE_DUPLICATE` | 409 | E3 |
| `INVALID_STATE_TRANSITION` | 409 | S4, A1, A3 |
| `INSUFFICIENT_STOCK` | 409 | E7 |
| `CONTACT_NOT_AVAILABLE` | 403 | S4 |
| `INVALID_SIGNATURE` | 403 | A5 — public DPP endpoint'lerinde `sig` yanlış/eksik |
| `INSUFFICIENT_ROLE` | 403 | Rol yetersiz (`RolesGuard`) |
| `PENDING_EXPERT_REVIEW` | 202 | A2 |
| `RATE_LIMIT_EXCEEDED` | 429 | H4 |
| `AI_SERVICE_UNAVAILABLE` | 503 | H1 |
| `WEIGHTS_SUM_INVALID` | 422 | AD2 |

### Sayfalama

Liste endpoint'leri `?page=1&limit=20` alır, zarf ile döner:

```json
{
  "data": [ ],
  "meta": { "page": 1, "limit": 20, "total": 137, "totalPages": 7 }
}
```

`limit` üst sınırı 100.

### Idempotency

Kayıt oluşturan POST'lar `Idempotency-Key` header'ı kabul eder (UUID). Aynı anahtarla
gelen ikinci istek, ilkinin cevabını döner. Cache süresi 24 saat (E3).

**İmplemente edildi (Faz 1.11, K-33).** Üçüncü savunma katmanı: `materials/outputs` ve
`materials/inputs`, aynı `facility_id` + birebir aynı `description` ile son 5 dakika
içinde bir kayıt varsa `409` döner:

```json
{ "error": "POSSIBLE_DUPLICATE",
  "message": "Bu açıklamayla son 5 dakika içinde bir kayıt zaten oluşturulmuş...",
  "details": { "duplicateId": "uuid" } }
```

İstemci `confirmDuplicate: true` ile bu kontrolü bilerek atlayıp devam edebilir.

---

## Auth

| Metod | Yol | Rol | Açıklama |
|---|---|---|---|
| POST | `/v1/auth/register` | Public | Tesis + ilk kullanıcı (`facility_admin`). 201, doğrulama e-postası gönderir |
| POST | `/v1/auth/login` | Public | `{access_token}` + refresh cookie |
| POST | `/v1/auth/refresh` | Public (cookie) | Yeni access token |
| GET | `/v1/auth/me` | Auth | Kullanıcı + tesis özeti |
| PUT | `/v1/auth/update-profile` | Auth | |
| POST | `/v1/auth/logout` | Auth | Refresh token'ı iptal eder |
| DELETE | `/v1/auth/delete-account` | Auth | |

**`POST /v1/auth/register`**

```json
{
  "name": "Doku Tekstil A.Ş.",
  "taxId": "1234567890",
  "sector": "textile",
  "email": "aylin@doku.com",
  "password": "Guvenli123!",
  "contactName": "Aylin Yıldız",
  "phone": "+90 5xx xxx xx xx",
  "osbId": "uuid | null",
  "location": { "lat": 40.19, "lng": 29.02 }
}
```

Şifre kuralı: min 8 karakter, en az bir büyük harf, bir küçük harf, bir rakam.
VKN 10 hane. Aynı VKN → `409 TAX_ID_ALREADY_EXISTS`.

Cevapta `facility.verified = false` ve `user.email_verified = false` döner — istemci
"onay bekleniyor" banner'ını buna göre gösterir.

Auth artık bu sözleşmeyle birebir uyumlu — cookie'li refresh, kayıt alanları, şifre
sıfırlama dahil. Bkz. [09-kararlar.md](09-kararlar.md) K-18.

---

## OSB Lookup

| Metod | Yol | Rol | Açıklama |
|---|---|---|---|
| GET | `/v1/osbs` | **Public** | `[{id, name, city}]` — register formundaki dropdown için |

Kimlik doğrulama gerektirmez (register akışında henüz token yok). Sayfalama yok — OSB
sayısı < 500 varsayımıyla tüm liste tek seferde döner. `region` (polygon) dönmez, sadece
ad ve şehir; hassas/ağır veri değil, istemci tarafında cache'lenebilir.

---

## Facilities

| Metod | Yol | Rol | Açıklama |
|---|---|---|---|
| GET | `/v1/facilities/me` | Auth | Kendi tesisi |
| PATCH | `/v1/facilities/me` | `facility_admin` | Ad, sektör, konum |
| POST | `/v1/facilities/me/documents` | `facility_admin` | Belge yükle (max 10 MB, PDF/JPG). 201 |
| GET | `/v1/facilities/me/documents` | Auth | Doğrulama durumu |

`documentType` yüklemede **zorunludur**: `tax_certificate` veya `operating_permit`
(`multipart/form-data` alanı, `facility_verification.document_type NOT NULL` ile eşleşir).
Dosyalar MVP için yerel diskte (`backend/uploads/facility-documents/`) saklanır — S3 gibi
bir nesne deposu Faz 3'te değerlendirilebilir, `.gitignore`'da hariç tutulmuştur.

---

## Admin — Tesis Doğrulama

| Metod | Yol | Rol | Açıklama |
|---|---|---|---|
| GET | `/v1/admin/verifications` | `admin` | Bekleyen (`pending`) doğrulama kayıtları |
| POST | `/v1/admin/verifications/:id/approve` | `admin` | İlgili `facility.verified = true` yapar |
| POST | `/v1/admin/verifications/:id/reject` | `admin` | `reason` zorunlu |

---

## Materials

`POST` (oluşturma) `facility.verified = true` gerektirir → aksi hâlde
`403 FACILITY_NOT_VERIFIED` (CLAUDE.md domain kuralı: "unverified bir tesis materyal
oluşturamaz"). GET/PATCH/DELETE bu kısıta tabi değil — zaten sahiplik kontrolünden geçiyor
ve doğrulanmamış bir tesisin görüntüleyecek bir kaydı olamaz (bkz. K-20).

CRUD ve DPP üretimi implemente edildi (Faz 1.3, 1.6, K-20/K-21). `Idempotency-Key`
outputs/inputs create'te destekleniyor (K-22) — `embedding`/find/scoring hâlâ yok
(Faz 1.4/1.5/1.7/1.8, AI servisine bağımlı).

| Metod | Yol | Rol | Açıklama |
|---|---|---|---|
| POST | `/v1/materials/outputs` | Auth + doğrulanmış | 201. `Idempotency-Key` destekler |
| GET | `/v1/materials/outputs` | Auth | Kendi tesisinin çıktıları, sayfalı |
| GET | `/v1/materials/outputs/:id` | Sahip | |
| PATCH | `/v1/materials/outputs/:id` | Sahip | Embedding yeniden hesaplanır |
| DELETE | `/v1/materials/outputs/:id` | Sahip | Aktif eşleşme varsa 409 |
| POST | `/v1/materials/inputs` | Auth + doğrulanmış | |
| GET | `/v1/materials/inputs` | Auth | |
| PATCH/DELETE | `/v1/materials/inputs/:id` | Sahip | |
| GET | `/v1/materials/passport/:id/json` | **Public** (`?sig=`) | DPP, ESPR formatı (A5) |
| GET | `/v1/materials/passport/:id/pdf` | **Public** (`?sig=`) | PDF binary, < 500 KB |
| GET | `/v1/materials/passport/:id/qr` | Sahip | QR görsel |

**`POST /v1/materials/outputs`**

```json
{
  "description": "Tekstil boyahanesi çıkışı arıtma çamuru, ağırlıklı olarak selüloz elyaf",
  "materialClass": "organic",
  "composition": { "selüloz": 60, "su": 30, "diğer": 10 },
  "quantityKg": 800,
  "stock": 800,
  "frequency": "daily",
  "confirmDuplicate": false
}
```

`quantityKg` **daima kilogram**. Birim dönüşümü frontend'de yapılır (E4).
`composition` toplamı 100 değilse DPP `dpp_compliant = false` işaretlenir (E8).

Başarı — 201:

`passportId`/`qrCode`/`pdfUrl` gerçek değerler döner (DPP senkron üretiliyor, K-21).
`embeddingPending` hâlâ her zaman `true` — embedding üretimi (Faz 1.4/1.5) henüz yok.

```json
{
  "outputId": "uuid",
  "passportId": "uuid",
  "qrCode": "https://.../dpp/abc123?sig=...",
  "pdfUrl": "https://.../passport/abc123.pdf",
  "embeddingPending": false,
  "pendingReview": false
}
```

`embeddingPending: true` → AI servisi yanıt vermedi, kayıt alındı, embedding kuyrukta (H1).
`pendingReview: true` → sınıflandırma güveni < 0.80, uzman kuyruğunda (A2).
Her iki durumda da **201 döner**; kayıt başarılıdır.

Mükerrer şüphesi — 409 (henüz implemente edilmedi, hedef davranış — Faz 1.11'in
kalan kısmı, K-22):

```json
{
  "error": "POSSIBLE_DUPLICATE",
  "message": "Benzer bir kayıt son 5 dakikada eklenmiş. Onaylıyor musunuz?",
  "details": { "duplicateId": "uuid" }
}
```

İstemci `confirmDuplicate: true` ile tekrar gönderir.

**Public DPP endpoint'leri** kimlik istemez ama `sig` (HMAC-SHA256) doğrulaması yapar.
QR kodun içindeki imza budur. Geçersiz imza → 403.

---

## Matches

Durum makinesi implemente edildi (Faz 1.10, K-23): list/get/accept/reject/contact
gerçek veriyle çalışıyor, `SELECT ... FOR UPDATE` ile stok kilitleniyor (E7). `find`
(aday bulma + skorlama) implemente edildi (Faz 1.7/1.8/1.9, K-24 → K-34 ile
kapatıldı) — pgvector benzerlik araması, 5 faktörlü skor, CBAM hesabı ve artık
embedding'lerin kaynağı olan `AiClientService` de gerçek: AI mikroservisine HTTP ile
bağlanıyor, 3s timeout, 500ms/1s/2s retry ve rolling-window circuit breaker içeriyor
(bkz. K-34, docs/07). `retry` henüz yok (Faz 2.8, expired match cron'una bağlı).

| Metod | Yol | Rol | Açıklama |
|---|---|---|---|
| GET | `/v1/matches/find/:outputId` | Sahip | Aday bul + skorla. 200 veya 202 |
| GET | `/v1/matches` | Auth | `?status=pending&page=1` |
| GET | `/v1/matches/:id` | Taraflardan biri | Detay + kısıtlı karşı taraf bilgisi |
| POST | `/v1/matches/:id/accept` | Taraflardan biri | 201. `Idempotency-Key` destekler |
| POST | `/v1/matches/:id/reject` | Taraflardan biri | `reasonCategory` **zorunlu**. `Idempotency-Key` destekler |
| POST | `/v1/matches/:id/retry` | Taraflardan biri | Sadece `expired` için. **Bekliyor (Faz 2.8)** |
| GET | `/v1/matches/:id/contact` | Taraflardan biri | **Sadece `completed`** — aksi hâlde 403 |

**`GET /v1/matches/find/:outputId`** — 200:

```json
{
  "matches": [
    {
      "matchId": "uuid",
      "totalScore": 78,
      "breakdown": {
        "material": 85, "quality": 72, "environmental": 90,
        "logistics": 68, "economic": 65
      },
      "distanceKm": 12.4,
      "co2Saved": 24000,
      "costSaving": 18500,
      "cbamImpact": 2917,
      "quantityRatio": 0.16,
      "partialMatch": true,
      "counterparty": {
        "osbName": "Ankara OSB",
        "sectorLabel": "yapı malzemeleri fabrikası",
        "approximateLocation": { "lat": 39.9, "lng": 32.8 }
      },
      "expiresAt": "2026-09-28T00:00:00Z"
    }
  ],
  "message": null
}
```

**Gizlilik kuralı:** kabul edilene kadar karşı tarafın adı, adresi ve iletişimi
gösterilmez. Sadece OSB adı, sektör etiketi ve yaklaşık konum döner (S3).

Aday yoksa — 200, boş liste + mesaj:

```json
{
  "matches": [],
  "message": "Şu an uygun eşleşme yok. Yeni tesisler eklendiğinde bildirim alacaksınız."
}
```

Çıktı uzman onayı bekliyorsa — **202**:

```json
{
  "error": "PENDING_EXPERT_REVIEW",
  "message": "Eşleştirme uzman onayı sonrası hazır olacak."
}
```

**`POST /v1/matches/:id/reject`**

```json
{ "reasonCategory": "distance_too_far", "reasonText": "300 km çok fazla" }
```

`reasonCategory` zorunlu; eksikse `400`. Geçerli değerler:
`distance_too_far` · `quantity_mismatch` · `quality_insufficient` · `price_too_low` ·
`timing_unsuitable` · `other`

Karşı tarafa giden bildirimde **sadece kategori** yer alır; `reasonText` paylaşılmaz (A1).

**`POST /v1/matches/:id/accept`** — durum makinesine göre davranır:

| Mevcut durum | Kabul eden | Yeni durum |
|---|---|---|
| `pending` | arz veya talep sahibi | `accepted` |
| `accepted` | henüz kabul etmemiş taraf | `completed` |
| `accepted` | aynı taraf tekrar | 409 |
| `completed` / `rejected` / `expired` | herhangi | 409 `INVALID_STATE_TRANSITION` |

`completed` olurken stok kontrolü yapılır; yetmiyorsa `409 INSUFFICIENT_STOCK` (E7).
İşlem `SELECT ... FOR UPDATE` ile kilitlenir.

**`GET /v1/matches/:id/contact`** — sadece `completed`:

```json
{ "companyName": "...", "contactName": "...", "email": "...", "phone": "..." }
```

Aksi hâlde `403 CONTACT_NOT_AVAILABLE` — "İletişim bilgileri karşılıklı onay sonrası açılır".

---

## Reports

| Metod | Yol | Rol | Açıklama |
|---|---|---|---|
| GET | `/v1/reports/environmental/:matchId` | Taraflardan biri | `?format=json\|pdf` |
| GET | `/v1/reports/cbam/:matchId` | Taraflardan biri | Sadece `completed` eşleşme |
| GET | `/v1/reports/dpp/:passportId` | Sahip | |
| GET | `/v1/reports` | Auth | Geçmiş raporlar, sayfalı |

Rapor üretildiği andaki faktörlerle donar; sonradan mevzuat değişse bile değişmez (AD3).

---

## Notifications

| Metod | Yol | Rol | Açıklama |
|---|---|---|---|
| GET | `/v1/notifications` | Auth | `?unread=true`, sayfalı |
| GET | `/v1/notifications/unread-count` | Auth | Badge sayacı |
| PATCH | `/v1/notifications/:id/read` | Sahip | |
| PATCH | `/v1/notifications/read-all` | Auth | |
| GET | `/v1/notifications/prefs` | Auth | |
| PATCH | `/v1/notifications/prefs` | Auth | Zorunlu tipler kapatılamaz |
| WS | `/v1/notifications/stream` | Auth | Socket.IO |

**WebSocket olayları** (sunucu → istemci):

```jsonc
// notification:new
{
  "type": "notification:new",
  "data": {
    "id": "uuid",
    "type": "match_completed",
    "title": "Yeni eşleşme kabul edildi!",
    "body": "Yapı Grup A.Ş. eşleşmenizi kabul etti.",
    "payload": { "match_id": "abc123", "route": "/matches/abc123" },
    "created_at": "2026-08-28T14:23:00Z"
  }
}

// notification:unread_count
{ "type": "notification:unread_count", "data": { "count": 3 } }
```

İstemci → sunucu: `{ "type": "notification:mark_read", "data": { "id": "uuid" } }`

---

## OSB Dashboard

Rol: `osb_manager`. Kullanıcı sadece kendi OSB'sinin verisini görür.
**İmplemente edildi (Faz 3.1/3.2)** — AI bağımlılığı yok, tamamen gerçek hesap.

| Metod | Yol | Açıklama |
|---|---|---|
| GET | `/v1/osb/stats` | KPI kartları — tesis sayısı, aktif eşleşme, CO2, CBAM, simbiyoz oranı |
| GET | `/v1/osb/facilities` | Bölge tesisleri, filtrelenebilir |
| GET | `/v1/osb/map` | Harita verisi — tesis pinleri + tamamlanmış eşleşme çizgileri |
| GET | `/v1/osb/reports/monthly` | `?period=2026-08&format=pdf\|xlsx` |

KPI formülleri [05-is-kurallari.md](05-is-kurallari.md)'de. `xlsx` formatı `exceljs`
paketiyle üretiliyor (yeni bağımlılık, sadece bu endpoint için).

---

## Admin

Rol: `admin`. `review-queue` endpoint'lerine `expert` de erişir.
Tesis doğrulama endpoint'leri (`/v1/admin/verifications/*`) yukarıda,
[Admin — Tesis Doğrulama](#admin--tesis-doğrulama) bölümünde — implemente edildi (Faz 1).
`users`/`review-queue`/`carbon-factors`/`config`/`audit-log` implemente edildi (Faz 2).
`weights`/`api-keys` implemente edildi (Faz 3.5/3.6) — ikisi de AI bağımsız, tamamen gerçek.

| Metod | Yol | Rol | Açıklama |
|---|---|---|---|
| GET | `/v1/admin/users` | `admin` | |
| POST | `/v1/admin/users` | `admin` | |
| PATCH | `/v1/admin/users/:id` | `admin` | Rol değiştirme dahil |
| GET | `/v1/admin/review-queue` | `admin`, `expert` | FIFO, `?sector=&minConfidence=` |
| GET | `/v1/admin/review-queue/:id` | `admin`, `expert` | Metin + AI top-3 + kullanıcının önceki 5 kaydı |
| POST | `/v1/admin/review-queue/:id/approve` | `admin`, `expert` | `{materialClass, notes}` |
| POST | `/v1/admin/review-queue/:id/reject` | `admin`, `expert` | `{notes}` |
| GET | `/v1/admin/weights` | `admin` | Tüm versiyonlar |
| POST | `/v1/admin/weights` | `admin` | Yeni versiyon. Toplam ≠ 1 → 422 |
| POST | `/v1/admin/weights/:id/activate` | `admin` | Eski aktif otomatik düşer |
| GET | `/v1/admin/carbon-factors` | `admin` | |
| POST | `/v1/admin/carbon-factors` | `admin` | Eskinin `valid_to`'sunu kapatır |
| GET | `/v1/admin/api-keys` | `admin` | |
| POST | `/v1/admin/api-keys` | `admin` | Anahtar **bir kez** döner, sonra hash saklanır |
| DELETE | `/v1/admin/api-keys/:id` | `admin` | `revoked_at` set eder |
| GET | `/v1/admin/config` | `admin` | `system_config` |
| PATCH | `/v1/admin/config` | `admin` | Eşik güncelleme |
| GET | `/v1/admin/audit-log` | `admin` | `?entity=&entityId=`, sayfalı |

**`POST /v1/admin/weights`** — toplam 1.000 olmalı:

```json
{
  "error": "WEIGHTS_SUM_INVALID",
  "message": "Toplam ağırlık 1.000 olmalı (şu an 1.100)"
}
```

---

## AI Proxy ve Chatbot

`POST /v1/ai/classify` gerçek `AiClientService` tarafından besleniyor (Faz 1.4, K-24 →
**K-34 ile kapatıldı**) — AI mikroservisine (ayrı repo, FastAPI) gerçek HTTP isteği atıyor,
3s timeout, 500ms/1s/2s retry ve rolling-window circuit breaker uyguluyor. AI servisinin
kendi kategori isimleri (Türkçe, büyük harf, 7 tane) ve `/embed` yanıtının eksik alanları
backend'deki adaptör katmanında (`ai-client.service.ts`, bkz. K-34, docs/07) uyarlanıyor —
`confidence`/`materialClass` artık gerçek modelin ürettiği değerler.
`/v1/chat*` de implemente edildi (Faz 3.3/3.4) ama **hâlâ ve bilinçli olarak dummy** bir
`ClaudeClientService` tarafından besleniyor (K-31, bkz. docs/15 Madde 10.5 uyumu) — SSE
akışı, mesaj kaydı, context, rate limit gerçek; yanıt içeriği sabit/kanned.

| Metod | Yol | Rol | Açıklama |
|---|---|---|---|
| POST | `/v1/ai/classify` | Auth | Canlı sınıflandırma önizlemesi (S2 adım 4). **Gerçek AI servisi (K-34)** |
| POST | `/v1/internal/ai/embed` | Internal | `EmbeddingsService` içinde dahili sarmalayıcı — dışa açık route değil, ayrı bir HTTP endpoint'i yok |
| POST | `/v1/chat` | Auth | Claude proxy, SSE streaming. **İmplemente edildi, bilinçli olarak dummy backing (Faz 3.3, K-31)** |
| GET | `/v1/chat/history` | Auth | Son mesajlar. **İmplemente edildi (Faz 3.3)** |

**`POST /v1/ai/classify`** — istemci form yazarken 500 ms debounce ile çağırır:

```json
{ "materialClass": "organic", "confidence": 0.87,
  "top3": [["organic",0.87],["chemical",0.08],["other",0.05]],
  "requiresHumanReview": false }
```

AI servisi erişilemezse `503 AI_SERVICE_UNAVAILABLE` — istemci sınıf dropdown'ını açar,
kullanıcı elle seçer (H1).

**Claude API anahtarı asla frontend'e verilmez.** `/v1/chat` backend proxy'sidir; sistem
promptu sabittir, kullanıcı mesajı max 2000 karakter (S6).

---

## IoT

**İmplemente edildi (Faz 3.7/3.8, K-32)** — MQTT taşıması hariç. Kimlik doğrulama JWT
değil, `X-Api-Key` header'ı (`/v1/admin/api-keys` ile üretilir). AI bağımlılığı yok.

| Metod | Yol | Rol | Açıklama |
|---|---|---|---|
| POST | `/v1/iot/sensor-data` | API key | `{outputId, levelKg, sensorType?, timestamp?}` (I1) |

`outputs.stock` günceller; seviye orijinal `quantityKg`'nin %20'sinin altına düşerse
`low_stock`, tam 0'a düşerse aktif eşleşmedeki karşı tarafa `output_depleted` bildirimi
gider. Sensörden 30 dakika veri gelmezse (`iot-heartbeat` cron'u, 5 dk'da bir) tesise
`sensor_offline`, veri geri gelince `sensor_online` bildirimi gider (I2). Gerçek MQTT
broker'ı (Mosquitto) bağlanmadı — bu endpoint bir MQTT<->HTTP köprüsünün çağıracağı
gerçek alım mantığını taşıyor.

---

## Health

| Metod | Yol | Rol | Açıklama |
|---|---|---|---|
| GET | `/health` | Public | Liveness |
| GET | `/health/ready` | Public | DB + AI servisi + Redis durumu |

DB erişilemezse `503` döner — 500 değil. İstemci "sistem geçici bakımda" gösterir (H2).

---

## Rate limit

`429` cevabı her zaman şu header'ları taşır:
`Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

| Endpoint | Limit | Anahtar |
|---|---|---|
| `POST /v1/auth/login` | 5 / 15 dk | IP (brute force) |
| `POST /v1/auth/register` | 3 / saat | IP (spam) |
| `POST /v1/materials/outputs` | 100 / saat | Kullanıcı |
| `GET /v1/matches/find/*` | 30 / dk | Kullanıcı |
| `POST /v1/ai/classify` | 60 / dk | Kullanıcı (debounce ile birlikte) |
| `POST /v1/chat` | 10 / dk + 50 / gün | Kullanıcı (Claude maliyeti) |
| Diğer authenticated | 1000 / saat | Kullanıcı |
| Public (DPP) | 100 / dk | IP |

```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Çok fazla istek gönderdiniz. 42 saniye sonra tekrar deneyin.",
  "details": { "retryAfterSeconds": 42 }
}
```

---

## Swagger

Çalışırken `http://localhost:3000/api/docs`.

Kaynak: `@nestjs/swagger` dekoratörleri + `backend/src/docs/*.yml` dosyaları,
`main.ts` içinde birleştirilir. Yeni bir modül eklerken kendi `.yml` dosyasını yaz;
`main.ts`'in yükleyicisi şu an sadece `auth.yml`'ı okuyor, klasörün tamamını okuyacak
şekilde genişletilmeli (Faz 0).
