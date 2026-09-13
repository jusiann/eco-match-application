# EcoMatch: Teknik Mimari ve Sistem Tasarım Raporu

> **Belge No:** EM-ARC-2026-V1  
> **Yarışma:** TEKNOFEST 2026 — Sıfır Atık ve Döngüsel Ekonomi  
> **Takım:** VectorMatch (#1003771)  
> **İlgili Şartname Maddesi:** Madde 10.3 (Başlık 4: Teknik Mimari Dokümanı)  
> **Sürüm:** 1.0.0 (Yarışma Teslim Paketi)  
> **Teknoloji Yığını:** NestJS 10 · Next.js 16 · Python 3.12 (FastAPI) · PostgreSQL 16 (pgvector + PostGIS) · Nginx · Docker

---

## İçindekiler

1. [Bölüm 1: Genel Sistem Mimarisi ve Servis Topolojisi](#bölüm-1-genel-sistem-mimarisi-ve-servis-topolojisi)
2. [Bölüm 2: Kullanıcı Rolleri ve Yetkilendirme Modeli (RBAC)](#bölüm-2-kullanıcı-rolleri-ve-yetkilendirme-modeli-rbac)
3. [Bölüm 3: Veri Tabanı Mimarisi ve Veri Modeli](#bölüm-3-veri-tabanı-mimarisi-ve-veri-modeli)
4. [Bölüm 4: API Sözleşmesi ve Servisler Arası İletişim Protokolü](#bölüm-4-api-sözleşmesi-ve-servisler-arası-iletişim-protokolü)
5. [Bölüm 5: Güvenlik, Kimlik Doğrulama ve Veri İzolasyonu](#bölüm-5-güvenlik-kimlik-doğrulama-ve-veri-izolasyonu)
6. [Bölüm 6: Ölçeklenebilirlik, Dayanıklılık ve Performans Yaklaşımı](#bölüm-6-ölçeklenebilirlik-dayanıklılık-ve-performans-yaklaşımı)

---

# Bölüm 1: Genel Sistem Mimarisi ve Servis Topolojisi

EcoMatch; organize sanayi bölgelerinde (OSB) atık ve yan ürünlerin döngüsel ekonomiye kazandırılmasını otomatikleştiren, yapay zekâ destekli bir endüstriyel simbiyoz platformudur.

Platform, yüksek uyumluluk ve bağımsız ölçeklenebilirlik sağlamak üzere **gevşek bağlı (loosely coupled) mikroservis mimarisi** prensiplerine göre tasarlanmıştır.

### 1.1. Servis Topolojisi Diyagramı

```mermaid
flowchart TB
    subgraph CLIENT_LAYER["İstemci Katmanı"]
        BROWSER["Web Tarayıcısı (Kullanıcı / Jüri)"]
        MOBILE["Mobil Tarayıcı / QR Barkod Okuyucu"]
    end

    subgraph REVERSE_PROXY["Ters Vekil ve Güvenlik Katmanı (Port 8080)"]
        NGINX["Nginx 1.27 (Ters Vekil)<br/>- / → Statik Web SPA<br/>- /v1/* → API Yönlendirme<br/>- /socket.io → WebSocket<br/>- /api/docs → Swagger Docs"]
        WEB_SPA["Next.js 16 + React 19 SPA<br/>(Statik Export HTML/CSS/JS)"]
    end

    subgraph BACKEND_LAYER["İş Mantığı Katmanı (Port 3001)"]
        API["EcoMatch Backend (NestJS 10 + Fastify)<br/>- Kimlik Doğrulama & RBAC<br/>- Malzeme CRUD & DPP Motoru<br/>- 5 Faktörlü AHP Eşleştirme Motoru<br/>- CBAM & Çevresel Etki Hesaplayıcı<br/>- WebSocket Bildirim Ağ Geçidi<br/>- Devre Kesici (Circuit Breaker)"]
    end

    subgraph AI_LAYER["Yapay Zekâ Katmanı (Port 8000)"]
        AI_SVC["AI Mikroservisi (Python 3.12 + FastAPI)<br/>- SBERT all-mpnet-base-v2 (768D)<br/>- Fine-Tuned Eşleştirme Modeli<br/>- Prototip Tabanlı Sınıflandırıcı<br/>- BM25 Hibrit Arama (alpha=0.1)<br/>- Durumsuz (Stateless) İşleme"]
    end

    subgraph DATA_LAYER["Veritabanı Katmanı (Port 5434 & 5433)"]
        DB_BACKEND[("PostgreSQL 16 (eco-match-db)<br/>- pgvector (HNSW Vektör İndeksi)<br/>- PostGIS (Uzamsal Coğrafi İndeks)<br/>- Prisma ORM Şeması<br/>- 14 Tablo, 14 Migrasyon")]
        DB_AI[("PostgreSQL 16 (ecomatch_pgvector)<br/>- pgvector Eklentisi<br/>- Kategori Prototip Deposu")]
    end

    BROWSER -->|HTTP / WebSocket| NGINX
    MOBILE -->|HTTP (QR Doğrulama)| NGINX
    NGINX -->|Statik Dosya Sunumu| WEB_SPA
    NGINX -->|Ters Vekil Proxy| API
    
    API -->|TCP 5432 SQL| DB_BACKEND
    API -->|HTTP REST POST /embed, /classify| AI_SVC
    AI_SVC -->|TCP 5432 SQL| DB_AI
```

### 1.2. Mimari Bileşenlerin Sorumluluk Dağılımı

| Bileşen | Teknoloji | Konteyner | Port | Sorumluluk Alanı |
|---|---|---|:---:|---|
| **Web SPA** | Next.js 16, React 19, TailwindCSS | `eco-match-web` | 8080 | Rol bazlı kullanıcı arayüzü, interaktif Leaflet haritası, DPP QR sayfaları. |
| **Ters Vekil** | Nginx 1.27 Alpine | `eco-match-web` | 8080 | Tek origin mimarisi (CORS izolasyonu), gzip sıkıştırma, SSL hazırlığı. |
| **Backend API** | NestJS 10, Fastify, Prisma 5 | `eco-match-backend` | 3001 | REST API, RBAC, 5 faktörlü eşleştirme, CBAM, PDF/QR üretimi, denetim izi. |
| **AI Servisi** | Python 3.12, FastAPI, SBERT | `eco-match-ai` | 8000 | 768 boyutlu anlamsal vektör üretimi, atık sınıflandırma, BM25 hibrit arama. |
| **İlişkisel DB** | PostgreSQL 16 + PostGIS + pgvector | `eco-match-db` | 5434 | Tesis, malzeme, eşleşme, katsayı ve HNSW vektör indeksleri deposu. |
| **AI Vektör DB** | PostgreSQL 16 + pgvector | `ecomatch_pgvector`| 5433 | AI sınıflandırma prototip örnekleri tablosu. |

---

# Bölüm 2: Kullanıcı Rolleri ve Yetkilendirme Modeli (RBAC)

EcoMatch platformunda katı bir Rol Tabanlı Erişim Kontrolü (**Role-Based Access Control - RBAC**) mimarisi uygulanmaktadır. Kimlik doğrulama JWT token'ları ile sağlanırken, yetkilendirme `RolesGuard` ve `@Roles(...)` dekoratörleri ile endpoint bazında denetlenir.

### 2.1. Tanımlı Kullanıcı Rolleri

1. **Tesis Yetkilisi (`facility_user`):**
   - Kendi sanayi tesisini temsil eder.
   - Atık (çıktı) ve hammadde (girdi) kayıtlarını sisteme girer, günceller.
   - 5 faktörlü eşleştirme algoritmasını tetikler, gelen teklifleri inceler, kabul veya reddeder.
   - Dijital Ürün Pasaportu (DPP) ve QR etiketlerini indirir.
   - *Kısıtlama:* Yalnızca kendi tesisine ait verilere erişebilir; karşı tesisin iletişim bilgilerini ancak eşleşme karşılıklı kabul edildikten sonra görebilir.
   - *Özel Koruma:* `VerifiedFacilityGuard` sayesinde tesisi sistem yöneticisi tarafından onaylanana kadar malzeme ekleyemez.

2. **OSB Yöneticisi (`osb_admin`):**
   - Kendi Organize Sanayi Bölgesine bağlı tüm tesislerin döngüsellik verilerini izler.
   - Bölgesel dashboard ve harita üzerinde malzeme akışlarını ve tesis dağılımını görüntüler.
   - Bölge geneli için aylık resmi Çevresel Etki ve Simbiyoz Raporunu (PDF ve Excel) indirir.

3. **HITL Alan Uzmanı (`expert`):**
   - Yapay zekâ sınıflandırma güven skoru $\%80$'in altında kalan atık kayıtlarını inceler (`review_queue`).
   - Yapay zekânın önerdiği en olası 3 kategori tahminini değerlendirir, onaylar veya düzeltir.
   - SLA süresi (72 saat) takibi yapar.

4. **Sistem Yöneticisi (`admin`):**
   - Platformun genel işleyişini, güvenliğini ve algoritma parametrelerini yönetir.
   - Yeni kayıt olan tesislerin sanayi sicil belgelerini ve vergi kimlik numaralarını (VKN) doğrulayarak tesisi onaylar (`verify`).
   - AHP skorlama ağırlıklarını (`weights_config`) günceller.
   - Dış sensör ve kantar entegrasyonları için IoT API anahtarları üretir.
   - `audit_log` tablosundan tüm sistem hareketlerini denetler.

5. **Anonim / Kamu / Sevkiyat Denetçisi:**
   - Oturum açmadan çalışan kamusal roldür.
   - Sevkiyat ambalajlarındaki QR kod tarandığında kriptografik imzalı `/dpp/:passportId?sig=...` sayfasından pasaport verilerini doğrular.

### 2.2. Rol Yetkilendirme Matrisi

| Kaynak / Fonksiyon | Anonim | Tesis Yetkilisi | OSB Yöneticisi | HITL Uzmanı | Sistem Admini |
|---|:---:|:---:|:---:|:---:|:---:|
| DPP QR Doğrulama (İmzalı URL) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Kimlik Doğrulama / Token Yenileme | ✅ | ✅ | ✅ | ✅ | ✅ |
| Çıktı / Girdi Ekleme, Düzenleme, Silme | ❌ | ✅ *(Onaylı tesis)* | ❌ | ❌ | ❌ |
| Eşleşme Arama ve Karar (Kabul/Red) | ❌ | ✅ *(Kendi tesisi)* | ❌ | ❌ | ❌ |
| Tesis İletişim Bilgisi Görme | ❌ | ✅ *(Yalnız kabulde)*| ❌ | ❌ | ✅ |
| OSB Dashboard ve Simbiyoz Haritası | ❌ | ❌ | ✅ | ❌ | ✅ |
| Aylık Bölgesel Rapor İndirme (PDF/XLSX)| ❌ | ❌ | ✅ | ❌ | ✅ |
| HITL İnceleme Kuyruğu Kararları | ❌ | ❌ | ❌ | ✅ | ✅ |
| Tesis Doğrulama (`facilities/verify`) | ❌ | ❌ | ❌ | ❌ | ✅ |
| Kullanıcı Yönetimi & Rol Değiştirme | ❌ | ❌ | ❌ | ❌ | ✅ |
| AHP Skor Ağırlıkları Kalibrasyonu | ❌ | ❌ | ❌ | ❌ | ✅ |
| IoT API Key Yönetimi | ❌ | ❌ | ❌ | ❌ | ✅ |
| Sistem Denetim İzi (`audit_log`) İnceleme | ❌ | ❌ | ❌ | ❌ | ✅ |

---

# Bölüm 3: Veri Tabanı Mimarisi ve Veri Modeli

EcoMatch veri katmanı; ilişkisel veri bütünlüğü, coğrafi uzamsal sorgular ve yüksek boyutlu vektör benzerlik aramasını tek bir motor üzerinde birleştiren **PostgreSQL 16** veritabanı ile inşa edilmiştir.

### 3.1. İlişkisel Varlık-İlişki (ER) Mimarisi

Sistemde 14 ana tablo bulunmaktadır:
1. `users`: Kullanıcı hesapları, roller (`role_type`), parola hash'leri.
2. `facilities`: Sanayi tesisleri, vergi no, sektör, PostGIS koordinat noktası (`location GEOMETRY(Point, 4326)`), doğrulama durumu.
3. `osbs`: Organize Sanayi Bölgeleri sicil ve sınır koordinatları.
4. `outputs`: Tesislerin sunduğu atık ve yan ürün kayıtları, miktarları, bileşimleri.
5. `inputs`: Tesislerin aradığı hammadde ihtiyaç kayıtları ve teknik toleransları.
6. `embeddings`: pgvector 768 boyutlu vektör kayıtları ve HNSW indeksi.
7. `matches`: Tesisler arası eşleşme kayıtları, 5 faktörlü skorlar, CBAM tasarrufları ve 5 aşamalı durum makinesi (`pending`, `accepted`, `completed`, `rejected`, `expired`).
8. `material_passports`: Dijital Ürün Pasaportları (DPP), HMAC-SHA256 imzaları, JSON metadata.
9. `review_queue`: HITL uzman inceleme bekleyen düşük güvenli YZ sınıflandırmaları.
10. `carbon_factors`: Malzeme bazlı emisyon faktörleri tablosu (`valid_from`, `valid_to` ile versiyonlu).
11. `weights_config`: AHP eşleştirme ağırlıkları tablosu.
12. `notifications`: Kullanıcılara iletilen sistem ve eşleşme bildirimleri.
13. `api_keys`: IoT cihazları için üretilen SHA-256 hash'li API anahtarları.
14. `audit_log`: Sistemdeki tüm mutasyonları kaydeden denetim izi tablosu.

### 3.2. Vektör Depolama ve İndeksleme Mimarisi

Vektör benzerlik aramasında `pgvector` eklentisi ve logaritmik hız sunan **HNSW** indeksi kullanılır:

```sql
-- Embeddings tablosu
CREATE TABLE embeddings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id      UUID NOT NULL,
  record_type    record_type NOT NULL,          -- 'input' | 'output'
  vector         vector(768) NOT NULL,          -- SBERT 768D float32
  model_version  VARCHAR(50) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_embeddings_record UNIQUE (record_id, record_type)
);

-- HNSW Vektör İndeksi
CREATE INDEX idx_embeddings_hnsw ON embeddings 
USING hnsw (vector vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

### 3.3. Hibrit Eşleştirme SQL Sorgusu (Vektör + PostGIS + İş Kuralı)

Tek bir optimize SQL sorgusu; vektör kosinüs mesafesini, PostGIS coğrafi mesafesini ve tesis doğrulama kurallarını birleştirerek milisaniyeler içinde adayları sıralar:

```sql
SELECT i.id, i.facility_id, i.quantity_kg,
       1 - (e_out.vector <=> e_in.vector) AS similarity,
       ST_Distance(f_out.location, f_in.location) / 1000 AS distance_km
  FROM inputs i
  JOIN embeddings e_in  ON e_in.record_id = i.id AND e_in.record_type = 'input'
  JOIN facilities f_in  ON f_in.id = i.facility_id
  JOIN outputs o        ON o.id = $1::uuid
  JOIN facilities f_out ON f_out.id = o.facility_id
  JOIN embeddings e_out ON e_out.record_id = o.id AND e_out.record_type = 'output'
 WHERE i.facility_id <> o.facility_id     -- Kendi tesisiyle eşleşemez
   AND i.active = TRUE
   AND f_in.verified = TRUE               -- Yalnızca onaylı tesisler
   AND 1 - (e_out.vector <=> e_in.vector) >= 0.60 -- Benzerlik eşiği
 ORDER BY similarity DESC
 LIMIT 20;
```

---

# Bölüm 4: API Sözleşmesi ve Servisler Arası İletişim Protokolü

EcoMatch sistemi, OpenAPI 3.0 standartlarında belgelenmiş RESTful API ve gerçek zamanlı WebSocket protokolleri ile haberleşir.

### 4.1. Temel REST API Uç Noktaları

| Metot | Uç Nokta | Yetkili Rol | Açıklama |
|---|---|---|---|
| `POST` | `/v1/auth/register` | Public | Tesis ve kullanıcı kaydı |
| `POST` | `/v1/auth/login` | Public | JWT access token ve httpOnly cookie üretimi |
| `POST` | `/v1/auth/refresh` | Public | Rotasyonlu refresh token ile oturum yenileme |
| `GET` | `/v1/materials/outputs` | Tesis Yetkilisi | Tesisin atık ve yan ürünlerini listeleme |
| `POST` | `/v1/materials/outputs` | Tesis Yetkilisi | Yeni çıktı kaydetme + SBERT vektör üretimi + DPP |
| `GET` | `/v1/matches/find/:outputId`| Tesis Yetkilisi | 5 faktörlü skorlama ile en iyi 10 eşleşmeyi bulma |
| `POST` | `/v1/matches/:id/accept`| Tesis Yetkilisi | Eşleşmeyi kabul etme (Durum makinesi: accepted/completed)|
| `POST` | `/v1/matches/:id/reject`| Tesis Yetkilisi | Gerekçeli ret işlemi |
| `GET` | `/v1/matches/:id/contact`| Tesis Yetkilisi | İki taraf da kabul ettiğinde iletişim bilgilerini açma |
| `GET` | `/v1/reports/dpp/:id` | Public | DPP Dijital Ürün Pasaportu JSON / PDF verisi |
| `GET` | `/v1/reports/environmental`| Tesis / OSB | Net CO2 ve CBAM tasarruf raporu PDF çıktısı |
| `GET` | `/v1/osb-dashboard/stats` | OSB Yöneticisi | Bölgesel kümülatif döngüsellik KPI'ları |
| `GET` | `/v1/admin/review-queue` | HITL Uzmanı | Düşük güvenli atık inceleme kuyruğu |
| `POST`| `/v1/admin/review-queue/:id/decision`| HITL Uzmanı | Kategori onaylama / düzeltme kararı |
| `POST`| `/v1/admin/facilities/:id/verify`| Sistem Admini | Tesis doğrulama onayı verme |

### 4.2. Servisler Arası İletişim Protokolü (Backend $\leftrightarrow$ AI Mikroservisi)

NestJS Backend ile Python AI mikroservisi arasındaki iletişim, Docker iç ağı üzerinden HTTP JSON REST çağrıları ile gerçekleşir:
- **`POST http://ai-service:8000/embed`**: Gönderilen metni (`text`) 768 boyutlu normalize vektöre dönüştürür.
- **`POST http://ai-service:8000/classify`**: Gönderilen metni (`text`) 7 kategori arasından sınıflandırır ve olasılık skorlarını döner.
- **Hata Davranışı:** AI servisi geçici olarak yanıt vermezse devre kesici (circuit breaker) devreye girer; backend isteği bekletmeden kaydı `embedding_pending = true` olarak veritabanına kaydeder ve asenkron kuyruğa alır.

---

# Bölüm 5: Güvenlik, Kimlik Doğrulama ve Veri İzolasyonu

EcoMatch platformu, endüstriyel veri gizliliği ve bilgi güvenliği ilkelerini (KVKK, ISO 27001) temel alacak şekilde geliştirilmiştir.

### 5.1. Kimlik ve Oturum Güvenliği
- **Kısa Ömürlü Access Token:** 1 saat geçerli JWT access token.
- **httpOnly ve SameSite Cookie:** 30 gün geçerli refresh token, JavaScript tarafından erişilemeyen `httpOnly; SameSite=Strict; Secure` çerezlerde saklanır; XSS (Cross-Site Scripting) saldırıları engellenir.
- **Rotasyonlu Token Mimarisi:** Her token yenileme isteğinde eski refresh token iptal edilir, çalınma riski minimize edilir.
- **Parola Güvenliği:** Parolalar en az 10 tuzlama turu (`salt round`) ile **bcrypt** algoritması kullanılarak hash'lenir.

### 5.2. Bakanlık Verisi ve Ticari Sır Koruma Mimarisi
Şartname Madde 10.5 gereğince kamu ve tesis verilerinin dış dünyaya sızması şu mimari tedbirlerle engellenmiştir:
1. **İç Ağ İzolasyonu:** AI mikroservisi ve veritabanı yalnızca Docker yerel ağında konuşur; internete doğrudan açık hiçbir portu yoktur.
2. **Chatbot Veri İzolasyonu:** Chatbot modülü yerel deterministik kütüphane (`ClaudeClientService`) üzerinden çalışır. Sorgularda tesis unvanı, vergi no, atık tonajı veya bakanlık verileri **kesinlikle dışarı aktarılmaz.**
3. **Eşleşme Öncesi Tesis Anonimizasyonu:** Eşleşme teklifi iki tarafça da onaylanana kadar tesis unvanı, yetkili adı ve telefon numarası maskelenir (*"Bursa OSB'de bir kimya tesisi"*).

### 5.3. Denetim İzi ve İzlenebilirlik (Audit Logging)
- Tüm veri mutasyon işlemleri (yeni çıktı, eşleşme kararı, ayar değişikliği), `AuditInterceptor` aracılığıyla aktör kimliği, işlem tipi, IP adresi ve zaman damgası bilgileriyle `audit_log` tablosuna kaydedilir.
- `actor_id` kolonu yabancı anahtar kısıtlamasına sahip değildir; bir kullanıcı silinse dahi geçmiş denetim kayıtları veri tabanında bütünlüğünü korur.

---

# Bölüm 6: Ölçeklenebilirlik, Dayanıklılık ve Performans Yaklaşımı

Platform; tek bir organize sanayi bölgesindeki pilot uygulamadan (TRL 4-5) Türkiye genelindeki yüzlerce OSB ve on binlerce tesise (TRL 7+) sorunsuz genişleyebilecek bir altyapıya sahiptir:

### 6.1. Durumsuz (Stateless) Yatay Ölçekleme
- Hem NestJS backend hem de FastAPI mikroservisi tamamen durumsuzdur (stateless). Oturum bilgisi istemci token'ında ve veritabanında saklanır.
- Yük arttığında Docker Swarm veya Kubernetes üzerinde konteyner replika sayısı (HPA) artırılarak gelen istekler Nginx yük dengeleyici üzerinden dağıtılır.

### 6.2. Yüksek Performanslı Vektör ve Coğrafi İndeksleme
- Kaba kuvvet (flat) arama binlerce kayıtta CPU kilitlenmesine yol açarken, **HNSW indeksi** sayesinde 100.000 malzeme kaydında anlamsal kosinüs benzerliği 15-30 milisaniyede hesaplanır ($O(\log N)$).
- Tesis koordinatları `PostGIS GiST` (R-Tree) indeksleri üzerinde sorgulanır; mesafe filtrelemeleri doğrudan bellek içi ağaç indeksinden çözülür.

### 6.3. Devre Kesici (Circuit Breaker) ve Dayanıklılık
- AI servisine yönelik çağrılarda kayan pencere (rolling 60s) devre kesici uygulanır:
  - 60 saniyede 20'den fazla istekte %50 hata oranı aşılırsa devre açılır (`open`).
  - 30 saniye boyunca AI servisine yeni istek atılmaz, doğrudan fallback uygulanır (malzeme kaydedilir, `embedding_pending = true` yapılır).
  - 30 saniye sonra tek bir deneme isteği (`half-open`) gönderilir; servis toparlanmışsa devre normale döner (`closed`).
- Bu mekanizma sayesinde yapay zekâ katmanındaki yoğunluk veya arızalar ana platformun web arayüzünü veya veritabanını asla kilitlemez.

### 6.4. Nginx Önbellek ve Statik Varlık İletimi
- Next.js web arayüzü statik export olarak derlenmiş olup doğrudan Nginx bellek önbelleğinden sunulur. Backend sunucusu yalnızca JSON API yanıtları üretmeye odaklanır.
