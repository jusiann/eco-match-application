# 08 · Yol Haritası

Bu dosya "sıradaki iş ne" sorusunun cevabıdır. Fazlar sıralıdır: bir fazın çıkış kriteri
sağlanmadan bir sonrakine geçilmez.

Süreler **backend adam-günü** cinsindendir. Frontend ve AI ekiplerinin işleri paralel
ilerler; buradaki tahminlere dahil değildir.

## Durum özeti

| Faz | Kapsam | Tahmin | Durum |
|---|---|---|---|
| **Faz 0** | Temel — şema, guard'lar, auth tamamlama | ~8 gün | **Tamamlandı** |
| **Faz 1** | MVP — kayıt → çıktı → eşleşme → kabul | ~18 gün | **Sıradaki** |
| **Faz 2** | HITL, bildirim, raporlama | ~14 gün | Bekliyor |
| **Faz 3** | Chatbot, OSB dashboard, IoT, kalibrasyon | ~12 gün | Bekliyor |

Bugün çalışan: auth modülü uçtan uca — register (email doğrulama ile), login, refresh
(rotasyonlu), verify-email, me, update-profile, logout (refresh token iptali ile),
delete-account. Ortak altyapı hazır: `HttpExceptionFilter`, `RolesGuard`, `AuditInterceptor`,
`VerifiedFacilityGuard` — Faz 1 modülleri bunları doğrudan kullanabilir.

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

| # | Görev | Öncelik | Süre | Senaryo |
|---|---|---|---|---|
| 1.1 | `facilities` modülü — profil, belge yükleme | **K** | 2 | S1 |
| 1.2 | Admin doğrulama endpoint'leri | **K** | 1 | S1 |
| 1.3 | `materials` modülü — output/input CRUD | **K** | 2.5 | S2 |
| 1.4 | `AiClient` — retry + circuit breaker | **K** | 2 | H1 |
| 1.5 | `EmbeddingsService` — pgvector yazma | **K** | 1.5 | S2 |
| 1.6 | `DPPGenerator` — JSON + PDF + QR + ESPR kontrolü | **K** | 2.5 | S2, E8 |
| 1.7 | Aday bulma sorgusu — pgvector + PostGIS + self-match filtresi | **K** | 2 | S3, E1 |
| 1.8 | `ScoringEngine` — 5 faktör, `weights_config`'ten okuma | **K** | 2.5 | S3, E2, E6 |
| 1.9 | `CBAMCalculator` | **K** | 1.5 | S3, S5 |
| 1.10 | Match kabul/red + durum makinesi + kilitleme | **K** | 2 | S4, A1, E7 |
| 1.11 | Idempotency + duplicate tespiti | Y | 1 | E3 |
| 1.12 | Public DPP endpoint'leri + HMAC imza | Y | 1 | A5 |

**Alt toplam: ~21.5 gün** (paralel çalışmayla ~18)

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
