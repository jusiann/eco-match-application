# 08 · Yol Haritası

Bu dosya "sıradaki iş ne" sorusunun cevabıdır. Fazlar sıralıdır: bir fazın çıkış kriteri
sağlanmadan bir sonrakine geçilmez.

Süreler **backend adam-günü** cinsindendir. Frontend ve AI ekiplerinin işleri paralel
ilerler; buradaki tahminlere dahil değildir.

## Durum özeti

| Faz | Kapsam | Tahmin | Durum |
|---|---|---|---|
| **Faz 0** | Temel — şema, guard'lar, auth tamamlama | ~8 gün | **Tamamlandı** |
| **Faz 1** | MVP — kayıt → çıktı → eşleşme → kabul | ~18 gün | **Devam ediyor** |
| **Faz 2** | HITL, bildirim, raporlama | ~14 gün | Bekliyor |
| **Faz 3** | Chatbot, OSB dashboard, IoT, kalibrasyon | ~12 gün | Bekliyor |

Bugün çalışan: auth modülü uçtan uca (K-18) · `GET /v1/osbs` · `facilities` modülü +
tesis doğrulama akışı (S1 baştan sona) · `materials` modülü — output/input CRUD + DPP
üretimi (JSON/PDF/QR, HMAC imzalı, K-20/K-21) · `matches` modülü — kabul/red/iletişim
durum makinesi, stok kilitleme (K-23) · Idempotency-Key (K-22). Kalan Faz 1 işi
(1.4/1.5/1.7/1.8/1.9) embedding'e bağımlı — AI servisi hazır olunca sırayla açılabilir.
Ortak altyapı hazır: `HttpExceptionFilter`, `RolesGuard`, `AuditInterceptor`,
`VerifiedFacilityGuard`, `IdempotencyInterceptor`, `@Public()` — sıradaki modüller
bunları doğrudan kullanabilir.

---

# Faz 0 · Temel

**Amaç:** Üzerine inşa edilebilir bir zemin. Şu an şema diskte yok, ortak guard'lar yok,
hata formatı yok. Bunlar olmadan yazılan her modül teknik borç üretir.

**Çıkış kriteri:** Migration'lar temiz bir veritabanına uygulanıyor · `npm run build`
geçiyor · auth uçtan uca çalışıyor · yeni bir modül yazmak için kopyalanacak sağlam bir
iskelet var.

### Görevler

| # | Görev | Öncelik | Süre | Durum |
|---|---|---|---|---|
| 0.1 | Migration 001-009 yaz | **K** | 3 | Tamamlandı |
| 0.2 | `schema.prisma` yeniden oluştur | **K** | 1 | Tamamlandı |
| 0.3 | `HttpExceptionFilter` | **K** | 0.5 | Tamamlandı |
| 0.4 | `RolesGuard` + `@Roles()` dekoratörü | **K** | 0.5 | Tamamlandı — henüz hiçbir route'ta kullanılmıyor, Faz 1 için hazır |
| 0.5 | `VerifiedFacilityGuard` | **K** | 0.5 | Tamamlandı — aynı şekilde Faz 1'i bekliyor |
| 0.6 | `register` rol düzeltmesi | **K** | 0.25 | Tamamlandı |
| 0.7 | `POST /v1/auth/refresh` | **K** | 0.5 | Tamamlandı (rotasyonlu) |
| 0.8 | E-posta doğrulama akışı | **K** | 1 | Tamamlandı — e-posta gönderimi stub (log'a yazar), gerçek SMTP/SendGrid bağlı değil |
| 0.9 | `/v1` route prefix'ine geçiş | Y | 0.5 | Tamamlandı |
| 0.10 | Swagger yükleyicisi: tüm `.yml` dosyaları | Y | 0.25 | Tamamlandı |
| 0.11 | `AuditInterceptor` | Y | 1 | Tamamlandı, `@Audit()` ile register/update-profile/delete-account'ta kullanılıyor |
| 0.12 | `JwtAuthGuard`'a `implements CanActivate` | O | 0.25 | Tamamlandı |
| 0.13 | Migration 010 — `audit_log.actor_id` FK'sını kaldır | **K** | — | Tamamlandı — testte bulunan gerçek hata, bkz. [09](09-kararlar.md) K-14 |

### Testte bulunan iki gerçek hata

Faz 0 sırasında uçtan uca test edilirken (kod incelemesiyle görülemeyecek) iki gerçek
hata bulundu ve düzeltildi:

1. **Refresh token rotasyonu çalışmıyordu.** bcrypt 72 baytı kırpıyor; aynı kullanıcının
   tüm refresh JWT'leri aynı 72 baytlık önekle başladığı için bcrypt onları aynı kabul
   ediyordu — iptal edilmiş bir token hâlâ kabul ediliyordu. SHA-256'ya geçildi.
   Bkz. [09-kararlar.md](09-kararlar.md) K-15.
2. **`delete-account` kendi audit kaydını yazamıyordu.** Kullanıcı kendi tesisini silince
   cascade ile kendi satırı da gidiyor; `actor_id` FK'sı artık var olmayan bir kullanıcıya
   referans veremediği için INSERT sessizce başarısız oluyordu (interceptor hatayı yuttuğu
   için ana istek etkilenmiyordu, ama audit izi kayboluyordu). FK kaldırıldı.
   Bkz. [09-kararlar.md](09-kararlar.md) K-14.

### Bilinen açıklar (orijinal, Faz 0 öncesi tespit edilen)

Faz 0 bu dört gerçek sorunu kapattı:

1. ~~**`prisma/schema.prisma` diskte yok**~~ — 0.1/0.2 ile çözüldü.
2. ~~**`register` ilk kullanıcıya `ADMIN` veriyor**~~ — 0.6 ile çözüldü.
3. **`EXPERT` rolü hiç yoktu** — enum'a eklendi (migration 002), henüz bu rolü kullanan
   bir endpoint yok (Faz 2, AD1).
4. ~~**`logout` hiçbir şey yapmıyor**~~ — 0.7'nin doğal sonucu olarak çözüldü:
   `logout` artık `refreshToken`'ı `null` yaparak oturumu gerçekten sonlandırıyor.

---

# Faz 1 · MVP

**Amaç:** Ürünün ana değer önerisi uçtan uca çalışsın. Bir tesis kaydolabilsin, çıktısını
girsin, eşleşme bulsun, kabul etsin.

**Çıkış kriteri:** S1 → S2 → S3 → S4 akışı gerçek veriyle baştan sona çalışıyor ·
E1, E2, E3, E4, E6, E7, E8 edge case'leri test kapsamında · H1 fallback'i doğrulanmış ·
demo yapılabilir.

### Görevler

| # | Görev | Öncelik | Süre | Senaryo | Durum |
|---|---|---|---|---|---|
| 1.0 | Auth'u 04'e tam uyumlu hale getirme + `outputs.frequency`/`rejection_reason_category` şema düzeltmesi (migration 012) | **K** | 1 | S1 | Tamamlandı — K-17, K-18 |
| 1.1 | `facilities` modülü — profil, belge yükleme | **K** | 2 | S1 | Tamamlandı |
| 1.2 | Admin doğrulama endpoint'leri | **K** | 1 | S1 | Tamamlandı |
| 1.3 | `materials` modülü — output/input CRUD | **K** | 2.5 | S2 | Tamamlandı (CRUD) — K-20 |
| 1.4 | `AiClient` — retry + circuit breaker | **K** | 2 | H1 | Sıradaki — AI servisi hazır olmalı |
| 1.5 | `EmbeddingsService` — pgvector yazma | **K** | 1.5 | S2 | Bekliyor — 1.4'e bağlı |
| 1.6 | `DPPGenerator` — JSON + PDF + QR + ESPR kontrolü | **K** | 2.5 | S2, E8 | Tamamlandı — K-21 |
| 1.7 | Aday bulma sorgusu — pgvector + PostGIS + self-match filtresi | **K** | 2 | S3, E1 | Bekliyor — embedding'e bağlı |
| 1.8 | `ScoringEngine` — 5 faktör, `weights_config`'ten okuma | **K** | 2.5 | S3, E2, E6 | Bekliyor — 1.7'ye bağlı |
| 1.9 | `CBAMCalculator` | **K** | 1.5 | S3, S5 | Bekliyor |
| 1.10 | Match kabul/red + durum makinesi + kilitleme | **K** | 2 | S4, A1, E7 | Tamamlandı — K-23 |
| 1.11 | Idempotency + duplicate tespiti | Y | 1 | E3 | Kısmen — Idempotency-Key tamam (K-22), sunucu taraflı 5-dk benzerlik tespiti hâlâ yok |
| 1.12 | Public DPP endpoint'leri + HMAC imza | Y | 1 | A5 | Tamamlandı (1.6 ile birlikte) |

**Alt toplam: ~21.5 gün** (paralel çalışmayla ~18)

### Bu oturumda tamamlanan (1.0 – 1.3, 1.6, 1.10, 1.11-kısmen, 1.12)

**AI gerektirmeyen Faz 1 endpoint'lerinin tamamı** bilinçli bir sıralamayla bitirildi —
1.7/1.8/1.9 (find, scoring, CBAM) hâlâ embedding'e bağlı oldukları için bekliyor.

- **`materials` modülü — CRUD (K-20):** `POST/GET /v1/materials/outputs`, `GET/PATCH/DELETE
  /v1/materials/outputs/:id`, `POST/GET /v1/materials/inputs`, `PATCH/DELETE
  /v1/materials/inputs/:id`. Sayfalı listeleme, sahiplik kontrolü (`404`), `materialClass`
  opsiyonel, `outputs` silme aktif eşleşme varsa `409`.
- **DPP üretimi (K-21):** `POST /v1/materials/outputs` artık DPP'yi senkron üretiyor —
  `pdfkit` + `qrcode` (yeni bağımlılıklar, native değil), HMAC imzası `JWT_SECRET_KEY`
  ile (ayrı anahtar açılmadı). `GET /v1/materials/passport/:id/json|pdf` public+imzalı,
  `.../qr` sahibe özel. ESPR kontrolünün sadece şemada karşılığı olan parçaları
  uygulanıyor (composition toplamı, material_class, konum, üretim tarihi) —
  physical_properties/origin şemada yok, atlandı.
- **`matches` modülü — durum makinesi (K-23):** `GET /v1/matches`, `GET /v1/matches/:id`,
  `POST .../accept`, `POST .../reject`, `GET .../contact`. Gizlilik kuralı (tamamlanana
  kadar sadece OSB adı + sektör), `SELECT ... FOR UPDATE` ile kilitli stok düşümü (E7).
  `find`/skorlama (1.7-1.8) olmadığı için testler `Match` satırlarını doğrudan fixture
  olarak açıyor — üretimde bu satırları 1.7-1.8 açacak.
  **Testte gerçek bir hata bulundu:** raw SQL sorgusu DB'nin lowercase enum değerini
  döndürüyordu, kod bunu Prisma'nın UPPERCASE değeriyle karşılaştırıyordu (K-09'un tam
  uyardığı sınır) — karşılaştırma sessizce hep `false` dönüyor, her `accept()` çağrısı
  yanlışlıkla eşleşmeyi tamamlıyordu (stok iki kez düşüyor, reddedilmiş eşleşme bile
  tekrar tamamlanabiliyordu). Düzeltildi.
- **Idempotency-Key (K-22, kısmen 1.11):** `@Idempotent()` + global interceptor,
  process-içi `Map` (Redis yok, tek instance için yeterli), 24 saat TTL, sadece 2xx
  cache'leniyor. `materials/outputs`, `materials/inputs`, `matches/:id/accept`,
  `matches/:id/reject` üzerinde aktif. Sunucu taraflı 5-dakika benzerlik tespiti
  (`POSSIBLE_DUPLICATE`) hâlâ yok.
- **Migration 011 gerçekte hiç uygulanmamıştı (K-19):** dosya diskte, dokümanlarda
  "tamamlandı" yazıyordu, canlı DB'de kolon yoktu. `materials` testinde `500` ile ortaya
  çıktı, uygulanıp doğrulandı.
- **Test paketi (`backend/test/`):** `materials.test.js` (DPP + idempotency dahil) ve
  yeni `matches.test.js` eklendi. Ayrıca dört gerçek hata bulunup düzeltildi: test
  sürecinin `JWT_SECRET_KEY`'i sunucununkiyle eşleşmiyordu (artık `.env`'i kendi
  yüklüyor), rotasyon testi aslında rotasyonu değil sahte bir token'ı test ediyordu,
  `api()` yardımcısı `/auth/refresh`'e otomatik cookie ekleyip "cookie'siz istek"
  testini imkânsız kılıyordu, ve DPP PDF dosyaları (`uploads/dpp-pdfs/`) hiç
  temizlenmiyordu. **229/229 assertion geçiyor.**

### Önceki oturumda tamamlanan (1.0 – 1.2)

- **Auth/04 uyumu (K-18):** refresh token artık `HttpOnly` cookie'de (`@fastify/cookie`),
  response body'de görünmüyor; `register` gövdesine `contactName`/`phone`/`osbId`/`location`
  eklendi (konum `ST_MakePoint` ile raw SQL, transaction içinde); `forgot-password` /
  `reset-password` eklendi (stateless JWT, K-13'ün açık kalan kısmı).
- **Migration 012 (K-17):** `outputs.frequency`, `matches.rejection_reason_category` üzerinde
  `CHECK` kısıtı.
- **`osbs` modülü:** `GET /v1/osbs` public lookup — register formundaki dropdown'ın
  bağımlı olduğu, daha önce hiç var olmayan endpoint.
- **`facilities` modülü:** `GET/PATCH /v1/facilities/me`, `POST/GET /v1/facilities/me/documents`
  (`@fastify/multipart`, yerel disk depolama, 10 MB / PDF-JPG sınırı).
- **`admin` modülü (kısmi — sadece doğrulama):** `GET /v1/admin/verifications`,
  `POST .../approve`, `POST .../reject`. Faz 2/3'teki geniş admin yüzeyinin (users,
  review-queue, weights, vb.) sadece bu dilimi.
- Uçtan uca test edildi: register → belge yükle → yanlış dosya tipi reddedilir →
  admin olmayan `/v1/admin/*`'a erişemez → admin onaylar → `facility.verified = true`.
  S1 artık gerçek veriyle baştan sona çalışıyor.

**Bilinen açıklar:** yüklenen belgeler için ayrı bir indirme/görüntüleme endpoint'i yok
(docs/04 da istemiyor, sadece durum listeleniyor); reset/verify JWT'leri tek kullanımlık
değil (K-18'de not edildi); `admin` rolüne sahip ilk kullanıcıyı oluşturacak bir endpoint
henüz yok — Faz 2 görev 2.x'te (`POST /v1/admin/users`) gelecek, o zamana kadar DB'de elle
atanmalı.

### Sıralama notu

1.4 ve 1.5, 1.3'ten hemen sonra gelmeli — çıktı kaydı bunlar olmadan yarım kalıyor.
1.7 ve 1.8 birlikte test edilmeli; skorlama tek başına doğrulanamaz, aday havuzu gerekiyor.

AI servisi hazır değilse: 1.4'ün fallback yolu (H1) zaten çıktının kaydedilmesini
sağlıyor. Sahte bir `/embed` (rastgele normalize vektör) ile 1.7 ve 1.8 geliştirilebilir —
eşleşme kalitesi anlamsız olur ama akış doğrulanır.

---

# Faz 2 · Uzman onayı, bildirim, raporlama

**Amaç:** Sistemin güvenilirlik ve uyum katmanı. AI emin olmadığında insana sorması,
kullanıcının olan bitenden haberdar olması, evrakın üretilebilmesi.

**Çıkış kriteri:** A2 HITL akışı çalışıyor · WebSocket bildirimleri gerçek zamanlı ·
CBAM ve çevresel rapor PDF üretiliyor · A3 cron'u çalışıyor.

### Görevler

| # | Görev | Öncelik | Süre | Senaryo |
|---|---|---|---|---|
| 2.1 | `ReviewQueueService` — HITL kuyruğu | **K** | 2 | A2 |
| 2.2 | Uzman endpoint'leri — liste, detay, onay/red | **K** | 1.5 | AD1 |
| 2.3 | HITL SLA takibi + 72 saat fallback | Y | 1 | A2 |
| 2.4 | `NotificationService` — DB + tercihler | **K** | 1.5 | A4 |
| 2.5 | WebSocket sunucusu (Socket.IO) | **K** | 1.5 | A4 |
| 2.6 | `ReportEngine` — çevresel + CBAM PDF | **K** | 2.5 | S5 |
| 2.7 | Expired match cron job | Y | 0.5 | A3 |
| 2.8 | Match retry endpoint'i | O | 0.5 | A3 |
| 2.9 | `carbon_factors` admin CRUD + retroaktiflik | Y | 1 | AD3 |
| 2.10 | Rate limit katmanı | Y | 1 | H4 |
| 2.11 | `/health/ready` — DB + AI + Redis | Y | 0.5 | H2 |
| 2.12 | Haftalık geri besleme export job'ı | O | 1 | A1, A2 |

**Alt toplam: ~14.5 gün**

---

# Faz 3 · Genişleme

**Amaç:** Yarışma sunumunda farkı yaratan modüller. Hiçbiri MVP için zorunlu değil.

**Çıkış kriteri:** Sunumda gösterilebilir · pilot OSB'ye açılabilir.

### Görevler

| # | Görev | Öncelik | Süre | Senaryo |
|---|---|---|---|---|
| 3.1 | OSB agregasyon endpoint'leri + KPI'lar | Y | 2 | AD4 |
| 3.2 | OSB aylık rapor (PDF/Excel) | Y | 1.5 | AD4 |
| 3.3 | `ChatbotProxy` — Claude API + SSE streaming | O | 2 | S6 |
| 3.4 | Chatbot maliyet/limit takibi | O | 1 | S6 |
| 3.5 | AHP ağırlık yönetimi — versiyon + aktivasyon | O | 1.5 | AD2 |
| 3.6 | `api_keys` yönetimi | O | 1 | — |
| 3.7 | `MQTTSubscriber` + `IoTHandler` | D | 2 | I1 |
| 3.8 | Sensör heartbeat izleme | D | 1 | I2 |

**Alt toplam: ~12 gün**

---

## Sürekli işler

Faza bağlı değil, her fazda ilerler.

| İş | Not |
|---|---|
| Test kapsamı | Her senaryo kodunun karşılığı bir test. [06](06-senaryolar.md) matrisi takip listesi |
| OpenAPI YAML | Her yeni endpoint kendi `.yml` girdisiyle gelir |
| Doküman senkronu | Şema değişikliği [03](03-veri-modeli.md), endpoint değişikliği [04](04-api-sozlesmesi.md) güncellenmeden merge edilmez |
| `docker-compose.yml` | postgres (pgvector+postgis), redis, mosquitto, ai-service, backend |
| CI | lint + build + test — Faz 1 içinde kurulmalı |
| Seed verisi | Demo için gerçekçi tesis/malzeme seti — jüri sunumu buna bağlı |

## Kaynak plandan farklar

Kaynak dokümandaki 8 haftalık takvim üç kişilik ekibin **tamamını** (AI + Backend +
Frontend) kapsıyordu. Buradaki fazlama sadece backend'i kapsıyor ve mevcut durumdan
başlıyor.

İki yapısal fark var:

1. **Faz 0 kaynak planda yok.** Orada şemanın var olduğu varsayılmış; gerçekte diskte
   yok. Bu 8 günlük iş, kaynak planın "Hafta 1: migration 002-005" satırının yerine geçiyor
   ve onu genişletiyor.
2. **Chatbot ve OSB dashboard Faz 3'e alındı.** Kaynak planda Hafta 5-6'daydılar.
   Sebep: ikisi de MVP akışının dışında ve backend'in kritik yolunu tıkamıyorlar.
