# 06 · Senaryolar

Bu dosya sistemin kabul kriteridir. Bir özellik "bitti" sayılmadan önce ilgili senaryonun
kriterleri sağlanmış olmalı.

**Kullanım:** yeni bir istek geldiğinde önce buradaki bir senaryoyla eşleşiyor mu bak.
Eşleşmiyorsa yeni senaryo yaz, sonra kodu. Test isimlerine senaryo kodunu koy:
`describe('E7 · concurrent accept', ...)`.

## Test matrisi

| Kod | Senaryo | Öncelik | Sahibi | Test türü | Faz |
|---|---|---|---|---|---|
| **S1** | Tesis kaydı + doğrulama | Kritik | BE + FE | E2E + Unit | 1 |
| **S2** | Çıktı kaydı + DPP | Kritik | BE + FE + AI | E2E + Integration | 1 |
| **S3** | Eşleştirme arama | Kritik | BE + FE | E2E + Integration | 1 |
| **S4** | Eşleştirme kabul + iletişim | Kritik | BE + FE | E2E | 1 |
| **S5** | CBAM raporu | Yüksek | BE + FE | Integration | 2 |
| **S6** | Chatbot | Orta | BE + FE | Integration | 3 |
| **A1** | Eşleştirme reddetme | Yüksek | BE + FE | E2E | 1 |
| **A2** | HITL akışı | Yüksek | BE + FE + AI | E2E + Integration | 2 |
| **A3** | Süresi dolmuş eşleşme | Orta | BE | Unit + Cron | 2 |
| **A4** | Bildirim akışı | Yüksek | BE + FE | E2E + WebSocket | 2 |
| **A5** | QR tarama + DPP doğrulama | Orta | FE (mobil) | E2E | 2 |
| **E1** | Self-match önleme | Yüksek | BE | Unit | 1 |
| **E2** | Yetersiz stok / kısmi eşleşme | Orta | BE + FE | Unit + Integration | 1 |
| **E3** | Duplicate önleme | Yüksek | BE + FE | Unit + Integration | 1 |
| **E4** | Ölçü birimi standardizasyonu | Yüksek | BE + FE | Unit | 1 |
| **E5** | Karışık dil girişi | Orta | AI + FE | Unit | 3 |
| **E6** | Konumu eksik tesis | Orta | BE + FE | Unit | 1 |
| **E7** | Eşzamanlı kabul yarışı | Orta-Yüksek | BE | Integration + Load | 1 |
| **E8** | Bozuk DPP verisi | Orta | BE + FE | Unit | 1 |
| **H1** | AI servis down | Yüksek | BE + AI | Integration + Chaos | 1 |
| **H2** | DB bağlantı kaybı | Yüksek | BE | Integration | 2 |
| **H3** | JWT süresi dolmuş | Yüksek | BE + FE | Unit + E2E | 0 |
| **H4** | Rate limit aşımı | Yüksek | BE | Load | 2 |
| **AD1** | Uzman HITL kuyruğu | Yüksek | BE + FE | E2E | 2 |
| **AD2** | AHP kalibrasyonu | Orta | BE + FE + AI | Integration | 3 |
| **AD3** | CBAM faktör güncelleme | Orta | BE + FE | Unit | 2 |
| **AD4** | OSB bölgesel rapor | Yüksek | BE + FE | Integration | 3 |
| **AD5** | Yeni malzeme sınıfı ekleme | Orta | BE + AI + FE | Migration + Manual | 3 |
| **I1** | IoT stok güncelleme | Düşük | BE | Integration | 3 |
| **I2** | Sensör bağlantı kaybı | Düşük | BE | Integration | 3 |

Toplam tahmini: Kritik + Yüksek ~48 adam-gün · Orta ~18 · Düşük ~3 · **~69 adam-gün**.

---

# Happy Path

## S1 · Tesis kaydı ve doğrulama

**Aktör:** Aylin (tesis) + Ayşe (admin) · **Öncelik:** Kritik (release-blocker)

**Akış**
1. Aylin kayıt formunu doldurur: e-posta, şifre, tesis adı, VKN, sektör, OSB, harita konumu
2. Frontend VKN format kontrolü (10 hane)
3. `POST /v1/auth/register` → 201, doğrulama e-postası gönderilir
4. Aylin linke tıklar → `email_verified = true`, giriş yapabilir
5. `facility_verification` kaydı "belge bekliyor" durumunda açılır — **malzeme ekleyemez**
6. Aylin ticaret sicil belgesini yükler (PDF/JPG, max 10 MB)
7. Ayşe admin panelinde görür, kontrol eder, onaylar → `facilities.verified = true`
8. Aylin'e `facility_verified` bildirimi (e-posta + in-app)

**Kabul kriterleri**

```gherkin
Senaryo: Geçerli bilgilerle kayıt
  Diyelim ki VKN "1234567890", e-posta "aylin@doku.com", şifre "Guvenli123!" girilir
  Ve konum haritada işaretlenir (lat=40.19, lng=29.02)
  Ne zaman "Kayıt Ol" tıklanırsa
  O zaman 201 döner ve doğrulama e-postası gönderilir
  Ve email_verified = false, facilities.verified = false olur
  Ve ilk kullanıcının rolü 'facility_admin' olur

Senaryo: Aynı VKN ile ikinci kayıt engellenir
  Diyelim ki VKN "1234567890" ile kayıtlı bir tesis vardır
  Ne zaman aynı VKN ile kayıt denenirse
  O zaman 409 TAX_ID_ALREADY_EXISTS döner
  Ve mesaj "Bu vergi numarası zaten kayıtlı" olur

Senaryo: Admin onayı sonrası tesis aktifleşir
  Ne zaman Ayşe "Onayla" tıklarsa
  O zaman facilities.verified = true olur
  Ve Aylin'e "facility_verified" bildirimi gider
  Ve audit_log'da action="verify", entity="facility" kaydı oluşur

Senaryo: Doğrulanmamış tesis malzeme ekleyemez
  Diyelim ki Aylin giriş yapmıştır ama facility.verified = false
  Ne zaman POST /v1/materials/outputs çağrılırsa
  O zaman 403 FACILITY_NOT_VERIFIED döner
  Ve mesaj "Tesisiniz henüz onaylanmadı" olur
```

**Endpoint'ler:** `POST /v1/auth/register` · `POST /v1/auth/verify-email` ·
`POST /v1/facilities/me/documents` · `GET /v1/admin/verifications` ·
`POST /v1/admin/verifications/:id/approve|reject`

**Bağımlılıklar:** E-posta servisi (SendGrid/SES/Postmark) · dosya depolama (MVP: yerel disk)
**Riskler:** Admin onaylamazsa kullanıcı bloke — SLA 48 saat. E-posta token'ı 24 saat geçerli.
**Not:** VKN doğrulaması MVP'de sadece format; GİB API entegrasyonu ileride opsiyonel.

---

## S2 · Çıktı kaydı ve DPP üretimi

**Aktör:** Aylin · **Ön koşul:** Tesis onaylı · **Öncelik:** Kritik

**Akış**
1. Aylin serbest metin girer: *"Tekstil boyahanesi çıkışı arıtma çamuru, ağırlıklı olarak selüloz elyaf, günlük 800 kg, kuru madde %35"*
2. Miktar (800), birim (kg), sıklık (günlük)
3. Yazarken 500 ms debounce ile `POST /v1/ai/classify` → "ORGANIC (%87)" önerisi
4. Kaydet → `POST /v1/materials/outputs`
5. Backend: `outputs` INSERT → `buildEmbeddingText()` → AI `/embed` → `embeddings` INSERT
6. DPP üretilir (`material_passports`) + QR kod
7. `audit_log` yazılır
8. 201 `{outputId, passportId, qrCode, pdfUrl}`

**Kabul kriterleri**

```gherkin
Senaryo: Çıktı eklenir
  Ne zaman "Kaydet" tıklanırsa
  O zaman 201 döner
  Ve outputs, embeddings, material_passports tablolarına birer kayıt eklenir
  Ve response içinde qrCode ve pdfUrl bulunur
  Ve audit_log'da action="create", entity="output" kaydı olur

Senaryo: Canlı sınıflandırma önerisi
  Diyelim ki açıklama alanına "arıtma çamuru selüloz" yazılmıştır
  Ne zaman 500 ms debounce dolarsa
  O zaman POST /v1/ai/classify çağrılır ve 300 ms içinde döner
  Ve önerilen sınıf "organic", güven ≥ 0.80 olur

Senaryo: AI servisi yavaşsa fallback
  Diyelim ki AI servisi 3 saniye timeout veriyor
  Ne zaman kullanıcı çıktı kaydederse
  O zaman çıktı yine kaydedilir
  Ve outputs.embedding_pending = true olur
  Ve embedding kuyruğa alınır
  Ve response 201 + embeddingPending: true döner

Senaryo: Aynı metinli iki çıktı çakışmaz
  Diyelim ki iki çıktı tam olarak aynı metinle kaydedilir
  O zaman embeddings tablosunda iki ayrı record_id ile iki satır oluşur
```

**Performans hedefleri**

| Metrik | Hedef |
|---|---|
| `/classify` p95 | < 500 ms (canlı öneri için kritik) |
| `/embed` p95 | < 300 ms (cache hit < 50 ms) |
| Form submit → 201 | < 2 saniye (DPP PDF üretimi dahil) |
| DPP PDF boyutu | < 500 KB |

**Endpoint'ler:** `POST /v1/ai/classify` · `POST /v1/materials/outputs` ·
`GET /v1/materials/passport/:id/pdf|json`

---

## S3 · Eşleştirme arama ve inceleme

**Aktör:** Aylin · **Ön koşul:** S2 tamamlandı, sistemde uyumlu bir `input` var
**Öncelik:** Kritik — ürünün ana değer önerisi

**Akış**
1. "Eşleştirmeleri Bul" → `GET /v1/matches/find/:outputId`
2. Çıktının vektörü alınır
3. pgvector HNSW ile Top-20 aday (similarity ≥ 0.60, farklı tesis)
4. Her aday için: `ST_Distance` → km, `weights_config` → aktif ağırlıklar
5. 5 faktörlü skor + CBAM etkisi
6. Top-10 `matches` tablosuna yazılır (`status='pending'`)
7. Kart listesi: skor rozeti, breakdown mini grafiği, mesafe, CO2

**Kabul kriterleri**

```gherkin
Senaryo: Uygun aday varsa liste döner
  Diyelim ki 3 uyumlu tesis vardır ve similarity > 0.60'tır
  Ne zaman "Eşleştirmeleri Bul" tıklanırsa
  O zaman response 3 saniye içinde döner
  Ve 200 OK ile en fazla 10 aday listelenir
  Ve her aday için totalScore, breakdown, distanceKm, co2Saved bulunur
  Ve matches tablosuna 3 kayıt (status='pending') eklenir

Senaryo: Hiç aday yoksa boş liste
  Ne zaman eşleştirme yapılırsa
  O zaman 200 OK ile boş liste döner
  Ve message "Şu an uygun eşleşme yok. Yeni tesisler eklendiğinde bildirim alacaksınız."

Senaryo: Skor sıralaması doğru
  Diyelim ki 3 adayın skorları [82, 71, 65]
  O zaman ilk kart 82, ikinci 71, üçüncü 65 olur
  Ve renk kodları: 82 yeşil, 71 sarı, 65 sarı

Senaryo: Adayın tam adresi gizli
  Ne zaman bir kart açılırsa
  O zaman sadece OSB adı ve mesafe gösterilir
  Ve tam adres gösterilmez
  Ve tesis adı genel bir etiketle gösterilir
```

**Gizlilik:** Kabul edilene kadar karşı tarafın iletişimi gizli. Self-match engellenir (E1).
Rate limit: aynı `outputId` için 30 istek/dk.

---

## S4 · Eşleştirmeyi kabul etme ve iletişim

**Aktör:** Aylin (arz) + Ali (talep) · **Öncelik:** Kritik

**Akış**
1. Aylin "Kabul Et" → onay modalı → `POST /v1/matches/:id/accept`
2. `status = 'accepted'`, `audit_log` yazılır
3. Ali'ye `match_pending_your_approval` bildirimi + WebSocket push
4. Ali kabul eder → `status = 'completed'`
5. İki tarafa da iletişim bilgileri açılır
6. `outputs.stock` düşülür
7. Çevresel rapor otomatik üretilir, `report_ready` bildirimi

**Kabul kriterleri**

```gherkin
Senaryo: İlk kabul — karşı taraf onayı bekleniyor
  Diyelim ki matchId=abc, status='pending'
  Ne zaman Aylin POST /v1/matches/abc/accept çağırırsa
  O zaman status 'accepted' olur (henüz completed değil)
  Ve karşı tarafa "match_pending_your_approval" bildirimi gider
  Ve WebSocket 'notification:new' event'i yayınlanır
  Ve audit_log'a kaydedilir

Senaryo: İkinci kabul — completed
  Diyelim ki status='accepted'
  Ne zaman Ali accept çağırırsa
  O zaman status 'completed' olur
  Ve iki tarafa da iletişim bilgileri açılır
  Ve environmental raporu oluşturulur

Senaryo: Tamamlanmış eşleşmede ikinci accept hata verir
  Diyelim ki status='completed'
  Ne zaman accept çağrılırsa
  O zaman 409 INVALID_STATE_TRANSITION döner
  Ve mesaj "Bu eşleştirme zaten tamamlanmış" olur

Senaryo: İletişim bilgisi sadece completed'da açılır
  Diyelim ki status='pending' veya 'accepted'
  Ne zaman GET /v1/matches/abc/contact çağrılırsa
  O zaman 403 CONTACT_NOT_AVAILABLE döner
  Ve mesaj "İletişim bilgileri karşılıklı onay sonrası açılır" olur
```

**Bildirimler:** `match_pending_your_approval` (karşı taraf) · `match_completed` (iki taraf) ·
`report_ready` (iki taraf)

---

## S5 · CBAM raporu oluşturma

**Aktör:** Aylin · **Ön koşul:** En az bir `completed` eşleşme · **Öncelik:** Yüksek

**Akış**
1. `completed` eşleşme detayında "CBAM Raporu İndir (PDF)"
2. `GET /v1/reports/cbam/:matchId`
3. Backend `matches` ve `carbon_factors`'tan (aktif faktörler) okur
4. PDF üretilir: tesis bilgisi, malzeme, miktar, CO2 hesabı, €/ton CBAM tasarrufu, kaynak + tarih, DPP QR
5. `reports` tablosuna kayıt (denetim izi)

**Rapor içeriği** — formüller ve örnek hesap [05-is-kurallari.md](05-is-kurallari.md)'de.

```
ECOMATCH — CBAM ETKİ RAPORU          Rapor No: CBAM-2026-08-1234
TESİS      Doku Tekstil A.Ş. · VKN 1234567890 · Bursa Nilüfer OSB · ISO 14001
EŞLEŞTİRME abc123 · 15.08.2026 · Yapı Grup A.Ş. · organic · 800 kg/gün → 24 ton/ay
KARBON     Birincil 1,85 · İkincil 0,42 · Net 1,43 kg CO2e/kg
           Aylık tasarruf: 34.320 kg CO2e (34,32 ton)
CBAM       85 EUR/ton → Aylık 2.917 EUR · Yıllık ~35.000 EUR
DOĞRULAMA  DPP QR + URL · İtiraz süresi 30 gün
```

**Kritik kural:** Rapor üretildiği andaki faktörlerle donar, retroaktif değişmez (AD3).

---

## S6 · Chatbot ile bilgi alma

**Aktör:** Aylin · **Öncelik:** Orta · **Faz:** 3

**Akış**
1. Sağ alt köşedeki widget açılır
2. `POST /v1/chat {message}`
3. Backend son 10 mesajı context olarak okur
4. Claude API çağrılır — sistem promptu sabit
5. Cevap `messages` tablosuna kaydedilir
6. SSE ile parça parça frontend'e akar

**Kabul kriterleri**

```gherkin
Senaryo: Basit soru-cevap
  Ne zaman "DPP nedir?" gönderilirse
  O zaman response 5 saniye içinde streaming olarak gelmeye başlar
  Ve messages tablosuna 2 kayıt eklenir (role=user + role=assistant)

Senaryo: Context korunur
  Diyelim ki önceki mesaj "arıtma çamurumu nereye satabilirim?" idi
  Ne zaman "ya tekstil elyafı?" denirse
  O zaman model bağlamı anlar ve elyaf için cevap verir

Senaryo: Claude API down
  Diyelim ki Claude API 503 döner
  O zaman kullanıcıya "Şu an chatbot müsait değil" gösterilir
  Ve DB'ye assistant mesajı kaydedilmez

Senaryo: Rate limit
  Diyelim ki kullanıcı dakikada 10 mesaj göndermiştir
  Ne zaman 11. mesaj gönderilirse
  O zaman 429 döner
```

**Güvenlik:** API anahtarı sadece backend'de · sistem promptu sabit · kullanıcı mesajı
max 2000 karakter · günlük 50 mesaj limiti · token maliyeti kullanıcı bazında loglanır.

---

# Alternatif Akışlar

## A1 · Eşleştirmeyi reddetme (gerekçe ile)

**Öncelik:** Yüksek

Red modalında kategori seçimi **zorunlu**: `distance_too_far` · `quantity_mismatch` ·
`quality_insufficient` · `price_too_low` · `timing_unsuitable` · `other`. Serbest metin opsiyonel.

```gherkin
Senaryo: Kategorili red
  Ne zaman POST /v1/matches/xyz/reject
      body: {reasonCategory: "distance_too_far", reasonText: "300km çok fazla"}
  O zaman status 'rejected' olur
  Ve rejection_reason_category = "distance_too_far" olur
  Ve audit_log'da action="reject" kaydı olur
  Ve karşı tarafa "match_rejected" bildirimi gider (kategori dahil, metin dahil DEĞİL)

Senaryo: Kategori zorunlu
  Ne zaman reasonCategory olmadan istek gelirse
  O zaman 400 döner ve error "reasonCategory zorunludur" olur

Senaryo: Reddedilen eşleşme tekrar açılamaz
  Diyelim ki status='rejected'
  Ne zaman accept çağrılırsa
  O zaman 409 döner
```

Red gerekçeleri haftalık batch ile `training/feedback/rejections.jsonl` dosyasına yazılır
ve AI ekibine gider.

---

## A2 · Human-in-the-Loop — düşük güvenli sınıflandırma

**Aktör:** Aylin → Prof. Kaan (uzman) · **Öncelik:** Yüksek

**Akış**
1. Belirsiz açıklama: *"boya artığı, karışık"*
2. Classify → `{materialClass: chemical, confidence: 0.62, requiresHumanReview: true}`
3. Formda sarı uyarı: "Sınıflandırma net değil (%62). Uzman incelemesine gönderilecek, 24 saat sürebilir."
4. Kaydet → `material_class = NULL`, `pending_review = true`
5. `human_review_queue` INSERT + uzmanlara `review_required` bildirimi
6. Kaan paneli açar: kullanıcı metni, AI top-3, miktar, kullanıcının önceki 5 kaydı
7. Doğru sınıfı seçer + not → onayla
8. `material_class` set edilir, embedding yeniden hesaplanır
9. Aylin'e `classification_approved` bildirimi, çıktı eşleştirmeye açılır

```gherkin
Senaryo: Güven 0.80 altında kuyruğa girer
  Diyelim ki classify {materialClass: chemical, confidence: 0.62} döner
  O zaman outputs.pending_review = true olur
  Ve human_review_queue'ya kayıt açılır (status='pending')
  Ve expert rolündeki kullanıcılara "review_required" bildirimi gider

Senaryo: Pending review olan output eşleştirilemez
  Diyelim ki pending_review=true
  Ne zaman GET /v1/matches/find/xyz çağrılırsa
  O zaman 202 döner
  Ve message "Eşleştirme uzman onayı sonrası hazır olacak" olur

Senaryo: Uzman onayı
  Ne zaman POST /v1/admin/review-queue/:id/approve
      body: {materialClass: "chemical", notes: "Boya çözücü kalıntısı"}
  O zaman pending_review = false, material_class = 'chemical' olur
  Ve embedding yeni sınıflandırmayla yeniden hesaplanır
  Ve Aylin'e "classification_approved" bildirimi gider

Senaryo: Uzman düzeltmesi eğitim setine gider
  Ne zaman haftalık export job çalışırsa
  O zaman training/human_reviewed.jsonl dosyasına satırlar eklenir
  Ve her satırda {text, ai_prediction, ai_confidence, human_label, notes} bulunur
```

**SLA ve fallback** tablosu [05-is-kurallari.md](05-is-kurallari.md)'de — 72 saat sonra
sistem AI'ın tahminini otomatik uygular.

---

## A3 · Süresi dolmuş eşleştirme

**Öncelik:** Orta · Gece 03:00 cron job

```gherkin
Senaryo: 30 günü geçen pending match expired olur
  Diyelim ki status='pending', expires_at 2 gün önce
  Ne zaman gece cron job'u çalışırsa
  O zaman status='expired' olur
  Ve iki tarafa "match_expired" bildirimi gider

Senaryo: Expired match tekrar accept edilemez
  Ne zaman accept çağrılırsa
  O zaman 409 döner ve mesaj "Süresi dolmuş" olur

Senaryo: Kullanıcı yeniden talep edebilir
  Ne zaman POST /v1/matches/xyz/retry çağrılırsa
  O zaman yeni bir match kaydı (yeni ID, status='pending', yeni expires_at) oluşur
  Ve eski match expired olarak kalır (audit izi)
```

```sql
UPDATE matches SET status='expired'
 WHERE expires_at < NOW() AND status IN ('pending','accepted');
```

---

## A4 · Bildirim alma ve aksiyon

**Öncelik:** Yüksek

Akış: karşı taraf kabul eder → `NotificationService` → (a) `notifications` INSERT,
(b) WebSocket push → bell badge + toast → tıkla → `payload.route`'a git → `read_at = NOW()`.

**Bildirim tercihleri (varsayılanlar)**

| Tip | In-app | E-posta | Push |
|---|---|---|---|
| `match_pending_your_approval` | Zorunlu | Açık | Açık |
| `match_completed` | Zorunlu | Açık | Açık |
| `match_rejected` | Zorunlu | Kapalı | Kapalı |
| `match_expired` | Zorunlu | Kapalı | Kapalı |
| `classification_approved` | Zorunlu | Kapalı | Açık |
| `review_required` (uzman) | Zorunlu | Günlük özet | Zorunlu |

WebSocket olay şeması [04-api-sozlesmesi.md](04-api-sozlesmesi.md)'de.

---

## A5 · QR kod tarama ile DPP doğrulama

**Aktör:** Alıcı tesis çalışanı · **Öncelik:** Orta

QR bir imzalı URL taşır: `https://<domain>/dpp/abc123?sig=xyz`. Mobil app
`GET /v1/materials/passport/abc123/json?sig=xyz` çağırır — **public endpoint, auth yok**.
Backend HMAC doğrular, passport JSON'unu döner.

Ekranda: malzeme adı, kompozisyon, üretici tesis, üretim tarihi, sınıflandırma, ESPR uyum
durumu. Uyumsuzsa kırmızı bant (E8).

DPP JSON yapısı [05-is-kurallari.md](05-is-kurallari.md)'de.

---

# Edge Case'ler

## E1 · Self-match önleme

Bir tesis hem `organic` çıktı üretip hem `organic` girdi arıyorsa (farklı bölümler),
kendi çıktısı kendi listesinde çıkmamalı.

```sql
WHERE i.facility_id <> (SELECT facility_id FROM outputs WHERE id = :outputId)
```

```gherkin
Senaryo: Aynı tesisten eşleşme filtrelenir
  Diyelim ki facility_A hem outputId=X hem inputId=Y sahibidir
  Ne zaman GET /v1/matches/find/X çağrılırsa
  O zaman response inputId=Y içermez
```

---

## E2 · Yetersiz stok / kısmi eşleşme

800 kg arz, 5000 kg talep. Eşleşme **elenmez**, işaretlenir.

- `quantityRatio = min(supply, demand) / max(supply, demand)` → 0.16
- `ratio < 0.20` ise `materialScore`'a 30 puan ceza
- UI: "Bu tesisin ihtiyacının %16'sını karşılayabilirsiniz"
- Alıcıya: "Talebinizin %16'sı için bu tesis uygun, kalanı için başka eşleşme arayın"

---

## E3 · Duplicate malzeme kaydı

Üç katmanlı savunma:

1. **İstemci:** Kaydet butonu tıklandıktan sonra disable (loading state)
2. **Idempotency:** Her form için UUID üretilir, `Idempotency-Key` header'ında gider.
   Backend 24 saat cache'ler; aynı anahtar → aynı cevap
3. **Sunucu tarafı benzerlik:** Aynı `facility_id` + aynı `description` + son 5 dakika →
   `409 POSSIBLE_DUPLICATE` + `duplicateId`. İstemci `confirmDuplicate: true` ile tekrarlar

---

## E4 · Farklı ölçü birimleri

DB'de her miktar **kilogram**. Frontend kullanıcıdan birim alır, kg'a çevirip gönderir.

```gherkin
Senaryo: kg'a otomatik çevrim
  Diyelim ki kullanıcı formda 5 ton girer
  O zaman body'de quantityKg = 5000 gönderilir

Senaryo: Yoğunluk olmayan sıvı reddedilir
  Diyelim ki materialClass=chemical, state=liquid, density yok
  Ne zaman sadece m³ ile miktar girilirse
  O zaman frontend "Sıvı için yoğunluk (kg/L) zorunlu" uyarısı verir
  Ve submit engellenir
```

---

## E5 · Karışık dil girişi

*"Tekstil boyahanesi wastewater treatment sludge, dry solid content 35%"*

- İstemcide dil tespiti (örn. `franc-min`) → uyarı: "Metinde İngilizce ifadeler var,
  Türkçe girmek daha isabetli sonuç verir"
- AI tarafında `enrich_text()` yaygın İngilizce terimleri Türkçe karşılıklarıyla zenginleştirir
- Yine de güven < 0.80 ise HITL kuyruğuna gider (A2)

---

## E6 · Konumu eksik tesis

`facilities.location = NULL` → `logisticsScore = 0`. Hata değil, ceza.

- Yeni kayıtta konum zorunlu (form validasyonu)
- Legacy kayıtlar için UI'de "karşı tesis konumu bilinmiyor" uyarısı
- Admin panelinde "konumu eksik tesisler" listesi → hatırlatma gönderilebilir

---

## E7 · Eşzamanlı kabul yarışı

Ali ve Veli aynı anda kabul ediyor, Aylin'in stoğu ikisine yetmiyor. **İlk tıklayan kazanır.**

```sql
SELECT m.*, o.stock, o.facility_id AS supplier_facility
  FROM matches m JOIN outputs o ON o.id = m.output_id
 WHERE m.id = $1
   FOR UPDATE;
```

- Transaction içinde `SELECT ... FOR UPDATE` ile output kilitlenir
- `completed`'e geçerken `stock < demand_qty` ise `409 INSUFFICIENT_STOCK`
- İstemci: "Başkası önce kabul etti, alternatif eşleştirme arayın"
- `completed` olunca `outputs.stock` düşülür

**Test türü:** integration + load — iki eşzamanlı istekle yarış koşulu doğrulanmalı.

---

## E8 · Bozuk malzeme pasaportu verisi

Kompozisyon toplamı %120 (selüloz 60 + su 30 + diğer 30).

- **İstemci:** toplam 100'ü aşarsa submit engellenir
- **Backend:** `isESPRCompliant()` false döner, `dpp_compliant = false`
- **DPP JSON:** `compliance.espr_compliant = false`,
  `compliance.issues = ["composition_sum_invalid"]`
- **QR ekranı:** kırmızı bant — "Bu DPP tam ESPR uyumlu değil"

Pasaport yine üretilir. Engellemek yerine işaretliyoruz — kullanıcı düzeltip yeniden
üretebilir, ama bu arada iş akışı durmaz.

---

# Hata Senaryoları

## H1 · AI servis down / timeout

**Öncelik:** Yüksek

| Katman | Davranış |
|---|---|
| Retry | 3 kez exponential backoff — 500 ms, 1 s, 2 s |
| Circuit breaker | Son 60 saniyede %50+ hata → 30 saniye devre açık, 30 sn sonra half-open (1 deneme) |
| Embed fallback | Çıktı kaydedilir, `embedding_pending = true`, Redis kuyruğuna iş eklenir |
| Classify fallback | `503` → istemci sınıf dropdown'ını açar, kullanıcı elle seçer |
| Match fallback | Zaten embed edilmiş kayıtlarla arama yapılır |
| Kullanıcı mesajı | "AI özelliği geçici olarak sınırlı. Kaydınız alındı, birazdan tam işlenecek." |

```gherkin
Senaryo: AI timeout, output yine kaydedilir
  Diyelim ki /embed 3s+ sürüyor ve backend timeout 3s
  Ne zaman kullanıcı output kaydederse
  O zaman outputs tablosuna kayıt açılır
  Ve embeddings tablosuna kayıt açılmaz
  Ve outputs.embedding_pending = true olur
  Ve Redis "pending_embeddings" kuyruğuna job eklenir
  Ve response 201 + embeddingPending: true döner

Senaryo: Circuit breaker açık
  Diyelim ki son 60 saniyede AI çağrılarının %50'si başarısız
  Ne zaman yeni bir /embed çağrısı gelirse
  O zaman backend AI'ı çağırmaz ve direkt fallback'e gider
  Ve breaker 30 saniye sonra half-open olur
```

Detay: [07-ai-entegrasyonu.md](07-ai-entegrasyonu.md)

---

## H2 · Veritabanı bağlantı kaybı

- Connection pool ile otomatik reconnect
- `GET /health/ready` DB durumunu kontrol eder (container health probe)
- Erişilemezse **503** döner, 500 değil
- Frontend global error boundary → "Sistem geçici erişilemez, birazdan tekrar deneyin"
- Kritik yazma işlemlerinde (accept, reject) istemci bir kez otomatik tekrar dener

---

## H3 · JWT süresi dolmuş

**Öncelik:** Yüksek (UX) · **Faz:** 0

- Access token 1 saat, refresh token 30 gün (HttpOnly cookie)
- İstemci interceptor'ı 401 alınca `POST /v1/auth/refresh` çağırır, orijinal isteği
  **bir kez** tekrarlar
- Refresh de başarısızsa: `/login?reason=session_expired`

Kullanıcı bu akışı hiç fark etmemeli.

---

## H4 · Rate limit aşımı

Limit tablosu ve `429` cevap formatı [04-api-sozlesmesi.md](04-api-sozlesmesi.md)'de.

---

# Admin / OSB Senaryoları

## AD1 · Uzman HITL kuyruğunu inceler

**Aktör:** Prof. Kaan · **Öncelik:** Yüksek

15 bekleyen kayıt. FIFO liste, sektör filtresi. Detayda: kullanıcı metni, AI top-3 güven
barları, kullanıcının önceki 5 kaydının sınıfları (tutarlılık kontrolü).

**UI gereksinimleri — opsiyonel değil:**
- **Batch mode:** aynı sektörden 10 kaydı yan yana toplu onaylama
- **Klavye kısayolları:** `1-5` sınıf seç · `A` approve · `R` reject · `←/→` gezinme
- **Undo:** 30 saniye içinde geri alma
- **Karşılaştırma:** bu output vs kullanıcının benzer önceki 3 outputu

Sebep: Kaan haftada 2-3 kez, oturum başı 30 dakika ayırıyor. Kayıt başına tek tek tıklama
akışı onun zamanını tüketir ve kuyruk birikir.

---

## AD2 · Admin AHP ağırlıklarını kalibre eder

**Öncelik:** Orta · **Faz:** 3

AI ekibi `scripts/ahp_calibration.py` çalıştırır → son 50 tamamlanmış eşleşmenin geri
bildirimini okur → pairwise comparison → `weights_proposal.json`. Admin panelden girer.

```gherkin
Senaryo: Toplam 1.000 olmak zorunda
  Diyelim ki ağırlıklar 0.30, 0.20, 0.20, 0.20, 0.20 (toplam 1.10)
  O zaman 422 WEIGHTS_SUM_INVALID döner
  Ve error "Toplam ağırlık 1.000 olmalı (şu an 1.100)" olur

Senaryo: Sadece bir versiyon aktif olabilir
  Diyelim ki v2 aktiftir
  Ne zaman v3 aktifleştirilirse
  O zaman v2 otomatik deaktive olur (kısmi unique indeks sayesinde)

Senaryo: Aktivasyon audit'te
  O zaman audit_log'da action="activate", entity="weights_config",
      entity_id=v3, before=v2, after=v3 kaydı bulunur
```

---

## AD3 · Admin CBAM faktörlerini günceller

**Öncelik:** Orta

AB tarifesi 85 → 95 EUR/ton çıktı. Admin yeni tarife ekler:
eskinin `valid_to` = 31.12.2026, yeni kayıt `valid_from` = 01.01.2027, `valid_to` = NULL.

**Kural: retroaktiflik yok.** Üretilmiş raporlar eski tarifeyi korur. `source` alanı
her kayıtta zorunlu (denetim için).

---

## AD4 · OSB müdürü bölgesel rapor çıkarır

**Öncelik:** Yüksek · **Faz:** 3

Dashboard: KPI kartları (tesis 127 · aktif eşleşme 45 · aylık CO2 12.400 kg ·
CBAM 1.054 EUR) → harita (tesis pinleri + tamamlanmış eşleşme çizgileri) → sektör
bazında en çok atık üreten / en aktif alıcı 10 tesis.

`GET /v1/osb/reports/monthly?period=2026-08&format=pdf|xlsx`

KPI formülleri [05-is-kurallari.md](05-is-kurallari.md)'de.

---

## AD5 · Admin yeni malzeme sınıfı ekler

**Öncelik:** Orta

Otomotiv için `rubber` gerekiyor. Sıra: AI ekibi sözlüğe kauçuk terimlerini ekler →
test setine 30+ örnek → accuracy testi → geçerse migration:

```sql
ALTER TYPE material_class ADD VALUE 'rubber';
```

Sonra backend enum, Prisma enum, frontend dropdown. Staging → production.

> Bu senaryo `material_class`'ın ENUM olmasının bedelidir: yeni değer migration gerektirir.
> VARCHAR olsaydı "ekle geç" olurdu ama yazım hataları da girerdi
> (`metal` / `Metal` / `METAL`). Tercihimiz katılık.

---

# IoT Senaryoları

IoT modülü opsiyoneldir. Entegrasyon tasarlanır ki ileride devreye alınabilsin.

## I1 · Sensör verisi stok günceller

Sensör 5 dakikada bir MQTT'ye yayınlar: `facility/xyz/tank/A` →
`{"level_kg": 750, "timestamp": "..."}`. Backend `facility/+/tank/+` topic'ine abone.

```gherkin
Senaryo: MQTT mesajı stock'u günceller
  Diyelim ki outputId=X, mevcut stock=800
  Ne zaman payload={"level_kg": 750} gelirse
  O zaman sensor_data'ya kayıt eklenir
  Ve outputs.stock = 750 olur

Senaryo: Düşük stok bildirimi
  Diyelim ki stock 250'den 90'a düşer
  O zaman outputs.availability = false olur
  Ve tesise "low_stock" bildirimi gider

Senaryo: Kimliksiz sensör mesajı reddedilir
  Ne zaman auth'suz mesaj gelirse
  O zaman mesaj işlenmez, log'a "unauth_sensor" düşer
```

Stok 0 olursa output `depleted` olur, aktif eşleşmelerdeki karşı taraflara bildirim gider.

---

## I2 · Sensör bağlantı kaybı

Backend 5 dakikada bir `sensor_data.timestamp` kontrol eder. 30 dakikadır veri yoksa
tesise `sensor_offline` bildirimi → manuel stok güncellemeye dönüş önerisi. Sensör geri
gelirse `sensor_online` + otomatik mod devam.

---

# Uçtan uca yolculuk (E2E)

Demo ve jüri sunumu için tek hikâye: **Bursa Nilüfer OSB'de bir ay.**

| Zaman | Olay | Senaryo |
|---|---|---|
| 1. hafta | Aylin tesisini kaydeder, belge yükler, Ayşe onaylar | S1 |
| 2. hafta | Çıktılarını girer. Çoğu için güven > 0.85. Biri 0.62 → Kaan onaylar | S2, A2 |
| 3. hafta | "Eşleştirmeleri Bul" → 4 aday. En yüksek Yapı Grup (78 puan, 12 km, 24 ton CO2/ay). Karşılıklı kabul | S3, S4, A4 |
| 4. hafta | İlk sevkıyat. Paletlerde DPP QR. Ali'nin çalışanı tarar, doğrular | A5 |
| Ay sonu | Aylin CBAM raporu indirir — yıllık 35.000 EUR tasarruf | S5 |
| Ay sonu | Mehmet OSB dashboard'dan aylık raporu Bakanlığa gönderir | AD4 |
| Ay sonu | AHP kalibrasyonu: lojistik ağırlığı 0.15 → 0.18 | AD2 |

Bu yolculuk Playwright E2E testinin de omurgasıdır: kayıt → giriş → çıktı ekle →
AI önerisi bekle → kaydet → QR gör → eşleştirme bul → kabul et.
