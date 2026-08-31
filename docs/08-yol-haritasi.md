# 08 · Yol Haritası

Bu dosya "sıradaki iş ne" sorusunun cevabıdır. Fazlar sıralıdır: bir fazın çıkış kriteri
sağlanmadan bir sonrakine geçilmez.

Süreler **backend adam-günü** cinsindendir. Frontend ve AI ekiplerinin işleri paralel
ilerler; buradaki tahminlere dahil değildir.

## Durum özeti

| Faz | Kapsam | Tahmin | Durum |
|---|---|---|---|
| **Faz 0** | Temel — şema, guard'lar, auth tamamlama | ~8 gün | **Tamamlandı** |
| **Faz 1** | MVP — kayıt → çıktı → eşleşme → kabul | ~18 gün | **Tamamlandı** |
| **Faz 2** | HITL, bildirim, raporlama | ~14 gün | **Tamamlandı** |
| **Faz 3** | Chatbot, OSB dashboard, IoT, kalibrasyon | ~12 gün | **Tamamlandı*** |

`*` IoT'nin MQTT taşıması hariç (HTTP+API key ile ikame edildi) — bkz. Faz 3 bölümü.

Bugün çalışan: auth (K-18) · `GET /v1/osbs` · `facilities` + tesis doğrulama (S1 baştan
sona) · `materials` — output/input CRUD + DPP üretimi (K-20/K-21) · `matches` — durum
makinesi + stok kilitleme (K-23) · Idempotency-Key (K-22) · `AiClientService` **dummy**
(K-24) üzerine kurulu ama tamamen **gerçek** aday bulma + 5 faktörlü skorlama + CBAM
hesabı (`GET /v1/matches/find/:outputId`) · `POST /v1/ai/classify`. HITL kuyruğu +
SLA fallback · bildirimler (DB + WebSocket) · çevresel/CBAM/DPP raporları · carbon-factors/
users/config/audit-log admin yüzeyi · expired-match cron'u + retry · haftalık geri besleme
export'u. Faz 3: chatbot (`ClaudeClientService` **dummy**, SSE) · OSB dashboard (KPI/harita/
aylık rapor PDF+XLSX) · AHP ağırlık versiyonlama · API key yönetimi · IoT sensör alımı +
bağlantı kaybı izleme. Faz 0-3'ün tamamı bitti. Ortak altyapı: `HttpExceptionFilter`,
`RolesGuard`, `AuditInterceptor` (before/after destekli), `VerifiedFacilityGuard`,
`IdempotencyInterceptor` (eşzamanlı istek güvenli), `ApiKeyGuard`, `@Public()`,
`SystemConfigService`.

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
| 1.4 | `AiClient` — retry + circuit breaker | **K** | 2 | H1 | Tamamlandı (dummy) — K-24, retry/CB yok |
| 1.5 | `EmbeddingsService` — pgvector yazma | **K** | 1.5 | S2 | Tamamlandı — K-24 |
| 1.6 | `DPPGenerator` — JSON + PDF + QR + ESPR kontrolü | **K** | 2.5 | S2, E8 | Tamamlandı — K-21 |
| 1.7 | Aday bulma sorgusu — pgvector + PostGIS + self-match filtresi | **K** | 2 | S3, E1 | Tamamlandı — K-24 |
| 1.8 | `ScoringEngine` — 5 faktör, `weights_config`'ten okuma | **K** | 2.5 | S3, E2, E6 | Tamamlandı — K-24 |
| 1.9 | `CBAMCalculator` | **K** | 1.5 | S3, S5 | Tamamlandı |
| 1.10 | Match kabul/red + durum makinesi + kilitleme | **K** | 2 | S4, A1, E7 | Tamamlandı — K-23 |
| 1.11 | Idempotency + duplicate tespiti | Y | 1 | E3 | Tamamlandı — Idempotency-Key (K-22) + sunucu taraflı 5-dk benzerlik tespiti (K-33) |
| 1.12 | Public DPP endpoint'leri + HMAC imza | Y | 1 | A5 | Tamamlandı (1.6 ile birlikte) |

**Alt toplam: ~21.5 gün** (paralel çalışmayla ~18)

### Faz 1 tamamlandı: AI-bağımlı kısımlar dummy (1.4, 1.5, 1.7, 1.8, 1.9)

Ekip arkadaşının AI servisi henüz yok. `AiClientService` dummy (K-24) — sözleşme şekli
`docs/07`'yle birebir, içerik anlamsız. Üzerine kurulu her şey **gerçek**:

- **`POST /v1/ai/classify`:** dummy `classify()`'ı sarmalıyor, backend kendi HITL eşiğini
  (`system_config['match.hitl_threshold']`) kontrol ediyor.
- **`EmbeddingsService`:** `buildEmbeddingText()` (docs/07 ile birebir) + pgvector yazımı
  gerçek. `materials.service.ts`'e bağlandı — çıktı/girdi oluşturulduğunda (materialClass
  varsa) otomatik embed ediliyor, `embeddingPending` artık gerçekten `false` olabiliyor.
- **`GET /v1/matches/find/:outputId`:** gerçek pgvector cosine benzerlik araması
  (docs/03'teki referans sorguyla birebir), self-match/eşik/aktiflik filtreleri, gerçek
  5 faktörlü skor (docs/05 formülleri, `scoring.service.ts`), gerçek CBAM hesabı
  (`carbon_factors` tablosundan). Sadece girdi vektörleri rastgele olduğu için eşleşme
  kalitesi anlamsız — test ederken `embeddings`'e doğrudan bilinen vektör yazılarak
  (`find.test.js`) deterministik hâle getirildi.
- **Ekonomik skor için malzeme fiyatları:** hiçbir dokümanda yoktu, `scoring.service.ts`
  içinde açıkça yer tutucu olarak işaretlenmiş sabit bir tabloyla dolduruldu.
- **Gerçek hata (testte bulundu, K-25):** `embeddings` tablosu polimorfik FK'sız;
  `deleteOutput`/`deleteInput` embedding satırını hiç silmiyordu, hesap silme cascade'i
  de zaten silemez (auth modülü materials tablolarını bilmiyor). 21 yetim satır birikti.
  Doğrudan silme yolu düzeltildi, test paketine bir "yetim süpürme" adımı eklendi.

**Faz 1 artık tamamen bitti** (1.11'in sunucu taraflı duplicate tespiti hariç — bu da
daha sonra kapatıldı, bkz. K-33).
**276/276 test assertion'ı geçiyor** (`ai.test.js`, `find.test.js` eklendi).

### Önceki: Faz 1'in AI gerektirmeyen kısmı (1.0 – 1.3, 1.6, 1.10, 1.11-kısmen, 1.12)

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
  (`POSSIBLE_DUPLICATE`) o sırada yoktu — sonradan eklendi, bkz. K-33.
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

| # | Görev | Öncelik | Süre | Senaryo | Durum |
|---|---|---|---|---|---|
| 2.1 | `ReviewQueueService` — HITL kuyruğu | **K** | 2 | A2 | Tamamlandı |
| 2.2 | Uzman endpoint'leri — liste, detay, onay/red | **K** | 1.5 | AD1 | Tamamlandı |
| 2.3 | HITL SLA takibi + 72 saat fallback | Y | 1 | A2 | Tamamlandı |
| 2.4 | `NotificationService` — DB + tercihler | **K** | 1.5 | A4 | Tamamlandı |
| 2.5 | WebSocket sunucusu (Socket.IO) | **K** | 1.5 | A4 | Tamamlandı |
| 2.6 | `ReportEngine` — çevresel + CBAM PDF | **K** | 2.5 | S5 | Tamamlandı |
| 2.7 | Expired match cron job | Y | 0.5 | A3 | Tamamlandı |
| 2.8 | Match retry endpoint'i | O | 0.5 | A3 | Tamamlandı |
| 2.9 | `carbon_factors` admin CRUD + retroaktiflik | Y | 1 | AD3 | Tamamlandı |
| 2.10 | Rate limit katmanı | Y | 1 | H4 | Tamamlandı — K-28: prod dışında register/login limitleri gevşetildi |
| 2.11 | `/health/ready` — DB + AI + Redis | Y | 0.5 | H2 | Tamamlandı — Redis henüz yok, `not_configured` döner |
| 2.12 | Haftalık geri besleme export job'ı | O | 1 | A1, A2 | Tamamlandı |

**Alt toplam: ~14.5 gün**

### Faz 2 tamamlandı: AI-bağımlı kısım dummy, gerisi gerçek

Uzman (expert) onayı, bildirimler, raporlama ve admin ek yüzeyi (carbon-factors CRUD,
kullanıcı yönetimi, sistem config, audit-log) uçtan uca test edildi
(`review-queue.test.js`, `notifications.test.js`, `reports.test.js`, `admin-extra.test.js`).

- **HITL kuyruğu:** sınıfsız bir çıktı oluşturulduğunda dummy `AiClientService.classify()`
  çağrılıyor (K-24), `human_review_queue` satırı + `EXPERT` rolündeki tüm kullanıcılara
  `review_required` bildirimi gerçek. Onay/red gerçek iş kuralı; onayda embedding yeniden
  hesaplanıyor (dummy). 72 saatlik SLA fallback cron'u `ai_suggestion.top3[0]`'ı otomatik
  uyguluyor (gerçek mantık, dummy veri üzerine).
- **Bildirimler:** DB yazımı + tercih kontrolü + WebSocket (`/v1/notifications/stream`)
  teslimatı tamamen gerçek. E-posta/push tercihleri **saklanıyor** ama gerçek gönderim
  kanalı yok — sadece in-app + WS teslim ediliyor.
- **Raporlar:** çevresel/CBAM/DPP raporları gerçek `carbon_factors` verisiyle hesaplanıyor,
  üretim anındaki değerlerle donuyor (AD3). K-27: `reports.match_id` NOT NULL olduğu için
  DPP raporu kendi `reports` satırını açamıyor, sahip-auth ile doğrudan `material_passports`'a
  geçiyor.
- **Gerçek hata (testte bulundu, K-29):** `AuditInterceptor`'ın entity id çözümü
  `outputId`/`inputId` gibi kaynak-özel alan adlarını tanımıyordu, output/input oluşturma
  audit_log'a hiç yazılmıyordu. Çözümleme zinciri genişletildi.
- **Test paketi:** 8 yeni test dosyası, idempotency race koşulu (K-30, eşzamanlı aynı
  anahtarlı istek artık handler'ı iki kez çalıştırmıyor) ve test dosyalarının `process.cwd()`
  yerine `BACKEND_DIR` (K-30) kullanması dahil iki gerçek hata daha bu süreçte bulundu.

**449/449 test assertion'ı geçiyor** (Faz 3 testleriyle birlikte).

---

# Faz 3 · Genişleme

**Amaç:** Yarışma sunumunda farkı yaratan modüller. Hiçbiri MVP için zorunlu değil.

**Çıkış kriteri:** Sunumda gösterilebilir · pilot OSB'ye açılabilir.

### Görevler

| # | Görev | Öncelik | Süre | Senaryo | Durum |
|---|---|---|---|---|---|
| 3.1 | OSB agregasyon endpoint'leri + KPI'lar | Y | 2 | AD4 | Tamamlandı |
| 3.2 | OSB aylık rapor (PDF/Excel) | Y | 1.5 | AD4 | Tamamlandı — Excel için `exceljs` eklendi |
| 3.3 | `ChatbotProxy` — Claude API + SSE streaming | O | 2 | S6 | Tamamlandı (dummy) — K-31 |
| 3.4 | Chatbot maliyet/limit takibi | O | 1 | S6 | Tamamlandı — 10/dk + 50/gün, `token_cost` tahmini |
| 3.5 | AHP ağırlık yönetimi — versiyon + aktivasyon | O | 1.5 | AD2 | Tamamlandı |
| 3.6 | `api_keys` yönetimi | O | 1 | — | Tamamlandı |
| 3.7 | `MQTTSubscriber` + `IoTHandler` | D | 2 | I1 | Kısmen — K-32: MQTT yerine HTTP+API key, alım mantığı gerçek |
| 3.8 | Sensör heartbeat izleme | D | 1 | I2 | Tamamlandı |

**Alt toplam: ~12 gün**

### Faz 3 tamamlandı: chatbot dummy, IoT'nin MQTT taşıması hariç gerisi gerçek

- **Chatbot (K-31):** `ClaudeClientService` dummy — anahtar kelime eşleştirmeli kanned
  yanıtlar, gerçek Anthropic SDK çağrısı yok (`ANTHROPIC_API_KEY` henüz okunmuyor). Üzerine
  kurulu her şey gerçek: SSE ile parça parça akış (Fastify `reply.raw`), `messages`
  tablosuna user+assistant kaydı, son 10 mesajlık context okuma, session devamlılığı,
  10/dk + 50/gün rate limit (`chat-daily` adlı ikinci throttler bucket'ı), 2000 karakter
  sınırı. "Claude API down" senaryosu (S6) gerçek bir hata değil — testte kanıtlamak için
  dummy istemci özel bir sentinel mesajda (`__SIMULATE_CLAUDE_DOWN__`) bilinçli olarak 503
  fırlatıyor; bu durumda assistant mesajı DB'ye hiç yazılmıyor (doğrulandı).
- **OSB Dashboard:** KPI'lar (docs/05 formülleri), harita (PostGIS lat/lng), aylık rapor
  (JSON/PDF/XLSX) tamamen gerçek hesap — hiçbir AI bağımlılığı yok.
- **AHP ağırlıkları:** toplam≠1 → 422 `WEIGHTS_SUM_INVALID`, aktivasyon `idx_weights_active`
  kısmi unique indeksiyle tutarlı (eskisi otomatik deaktive). `AuditInterceptor` bu endpoint
  için ilk kez before/after taşıyor (opsiyonel `result._audit` alanı, geriye dönük uyumlu).
- **API Keys:** SHA-256 hash (K-15 ile aynı kural, bcrypt değil), ham anahtar sadece
  oluşturma yanıtında bir kez dönüyor.
- **IoT (K-32):** Gerçek Mosquitto/MQTT bağlantısı kurulmadı — "deploy hedefi mütevazı"
  ilkesi ve bu ortamda test edilebilir bir broker olmaması nedeniyle. Bunun yerine
  `POST /v1/iot/sensor-data` (X-Api-Key auth) gerçek MQTT mesaj işleyicisinin yapacağı işi
  birebir yapıyor: `sensor_data` yazımı, `outputs.stock` güncelleme, %20 eşiğinde
  `low_stock`, stok 0'da aktif eşleşmedeki karşı tarafa `output_depleted` bildirimi. 5
  dakikalık heartbeat cron'u (I2) son bildirim tipini "bilinen durum" olarak kullanıyor,
  sunucu yeniden başlasa bile kaybolmuyor (K-22'nin process-içi Map'inin aksine).
- **Gerçek hata (testte bulundu):** `pdfkit`/`exceljs`'in TypeScript import şekli
  (`import PDFDocument from 'pdfkit'` yerine `import * as PDFDocument`, `ExcelJS.Workbook`
  yerine adlandırılmış `{ Workbook }`) yanlış yazılmıştı, ikisi de derleniyor ama
  çalışma zamanında "is not a constructor" ile patlıyordu — sadece gerçek bir istekle
  ortaya çıktı, `tsc`/`nest build` yakalamadı.

**537/537 test assertion'ı geçiyor** (Faz 0-3'ün tamamı).

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
