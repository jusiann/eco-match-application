# 09 · Kararlar

"Bu neden böyle?" sorusunun cevabı. Her kayıt: **bağlam** (sorun neydi), **karar**
(ne yaptık), **sonuç** (bunun bedeli ne).

Yeni bir mimari karar aldığında buraya bir kayıt ekle. Kararı değiştirirsen eskisini
silme — üstünü çiz, yerine geçen kaydı işaret et.

---

## K-01 · Benzerlik eşiği 0.60

**Bağlam.** Aynı değer dört yerde farklı yazıyordu: TEKNOFEST raporu 0.60, sequence
diyagramı 0.65, class diyagramı 0.65, ER diyagramı 0.65.

**Karar.** **0.60**. Ampirik gerekçe: 105 malzeme ve 30 etiketli çift üzerinde yapılan
testte 0.60 hem yanlış pozitif oranını düşük tuttu hem anlamlı eşleşmeleri kaçırmadı.

**Sonuç.** Diyagramlardaki 0.65 değerleri **yanlıştır**. Eşik `system_config` tablosunda
(`match.threshold`) tutulur; kodda sabit değildir. Değiştirilmesi kalibrasyonu geçersiz
kılar — ampirik testi tekrarlamadan dokunulmaz.

---

## K-02 · Rol modeli: beş rol, `FACILITY_ADMIN` düzeltmesi

**Bağlam.** Üç ayrı sorun üst üste binmişti:

- ER diyagramı `('user','admin','osb','api_key')`, class diyagramı
  `USER, ADMIN, OSB_MANAGER, API_KEY` diyordu — `osb` ile `OSB_MANAGER` uyuşmuyordu
- `api_key` bir rol mü, bir kimlik doğrulama yöntemi mi belirsizdi
- Kodda `register`, tesisin ilk kullanıcısına `ADMIN` rolü veriyordu — ama `ADMIN`
  EcoMatch operasyon ekibi demek. Tesis kullanıcısı platform admini oluyordu
- HITL senaryolarının (A2, AD1) aktörü olan **uzman** için hiçbir rol yoktu

**Karar.** Beş rol:

| Rol              | Kim                                                 |
| ---------------- | --------------------------------------------------- |
| `USER`           | Tesis çalışanı                                      |
| `FACILITY_ADMIN` | Tesisin yetkilisi — kayıtta ilk kullanıcı bunu alır |
| `EXPERT`         | HITL uzmanı (Prof. Kaan)                            |
| `OSB_MANAGER`    | OSB yöneticisi (Mehmet)                             |
| `ADMIN`          | EcoMatch operasyon ekibi (Ayşe)                     |

`api_key` rol olmaktan çıkarıldı, `api_keys` tablosuna taşındı.

**Sonuç.** `register` düzeltilmeli (Faz 0.6). `EXPERT` kaynak belgelerde yoktu — bu bir
ekleme, düzeltme değil; senaryolar onsuz implemente edilemiyordu.

---

## K-03 · Proje adı EcoMatch

**Bağlam.** Dört isim dolaşıyordu: UML diyagramlarında _DönguNet_, TEKNOFEST raporunda
_EcoMatch_ (proje) ve _VectorMatch_ (takım), eski yazışmalarda _SymbioLoop_.

**Karar.** Proje **EcoMatch**, takım **VectorMatch**. DönguNet ve SymbioLoop kullanılmıyor.

**Sonuç.** Kaynak PDF'ler ve dört diyagram "DönguNet" yazıyor — okurken zihnen değiştir.
Kod tabanı zaten `eco-match-backend`. Diyagramlar yenilendiğinde başlıkları güncellenmeli.

> Bu karar, kaynak teknik dokümanın 2.2 bölümündeki kararın **tersidir**. O doküman
> DönguNet'i seçmişti; sonradan EcoMatch'e dönüldü.

---

## K-04 · Şema kaynağı: elle yazılan SQL migration'lar

**Bağlam.** Prisma `vector(768)` ve `geography` tiplerini native desteklemiyor.
`prisma migrate dev` bu kolonları temsil edemediği için DDL üretirken bozuyor.
Ayrıca projede `schema.prisma` diskte yoktu ve hiç migration geçmişi yoktu.

**Değerlendirilen seçenekler.**

| Seçenek                                     | Neden seçilmedi                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Prisma + `Unsupported()` + `prisma migrate` | Migration üretimi hâlâ güvenilmez; HNSW indeks parametreleri ve kısmi indeksler ifade edilemiyor |
| Drizzle / Kysely'e geçiş                    | Mevcut auth modülü baştan yazılır; 8 haftalık takvimde gereksiz risk                             |

**Karar.** `backend/prisma/migrations/*.sql` şemanın tek gerçek kaynağı. Prisma yalnızca
tipli uygulama sorguları için. `schema.prisma` elle senkron tutulur.

**Sonuç.** `prisma migrate dev` **çalıştırılmaz** — `.claude/settings.json` içinde deny
listesinde. Bedeli: şema değişikliği iki yerde yapılır (SQL + `schema.prisma`), senkron
elle tutulur. Karşılığı: HNSW parametreleri (`m=16, ef_construction=64`), kısmi indeksler,
`CHECK` kısıtları ve PostGIS tipleri tam kontrolde.

---

## K-05 · `material_class` PostgreSQL ENUM

**Bağlam.** ER diyagramı `VARCHAR(50)`, class diyagramı 8 değerli enum diyordu.
VARCHAR, `metal` / `Metal` / `METAL` gibi tutarsız kayıtlara açık kapı bırakıyordu.

**Karar.** PostgreSQL seviyesinde ENUM, 8 değer:
`metal · plastic · organic · chemical · textile · glass · paper · other`

**Sonuç.** Yeni sınıf eklemek migration gerektiriyor (senaryo AD5) —
`ALTER TYPE ... ADD VALUE`, transaction dışında. Esneklik yerine katılığı seçtik;
sınıflandırıcı çıktısıyla DB kaydı birebir eşleşiyor.

---

## K-06 · AI servisi stateless

**Bağlam.** AI servisinin kendi in-memory vektör deposu vardı ve `record_id`'yi `integer`
tutuyordu. Backend `UUID` gönderiyordu. Servis ya hata fırlatıyor ya da **sessizce bozuk
indeks üretiyordu**.

**Karar.** AI servisi hiçbir şey saklamaz. Vektörü döndürür, backend `embeddings`
tablosuna yazar. `record_id` ve `record_type` istekte gönderilir ama **yalnızca
log/trace** amaçlı.

**Sonuç.** Tip uyuşmazlığı yapısal olarak imkânsız. AI servisi yatay ölçeklenebilir,
çöktüğünde veri kaybı olmuyor. Class diyagramındaki `AIClient --produces--> Embedding`
oku **yanlıştır**; embedding'i backend'deki `EmbeddingsService` üretir.

---

## K-07 · Red gerekçesi ikiye ayrıldı

**Bağlam.** ER diyagramında `matches.rejection_reason` tek bir `TEXT` alanıydı. Ama
senaryo A1, kategoriyi karşı tarafla paylaşıp serbest metni gizli tutuyor.

**Karar.** İki kolon: `rejection_reason_category VARCHAR(50)` (zorunlu, karşı tarafa
gösterilir) ve `rejection_reason_text TEXT` (opsiyonel, gizli).

**Sonuç.** Kaynak ER diyagramından sapma. Tek alanla A1'in gizlilik kuralı
uygulanamıyordu — kategoriyi metinden ayrıştırmak kırılgan olurdu.

---

## K-08 · `human_review_queue` hem çıktıyı hem eşleşmeyi kapsar

**Bağlam.** Kaynak dokümanda bu tablo sadece `match_id` tutuyordu. Ama senaryo A2'de
incelenen şey bir **sınıflandırma** — o aşamada henüz eşleşme yok, sadece bir `output` var.

**Karar.** `output_id` ve `match_id` kolonlarının ikisi de nullable,
`CHECK (output_id IS NOT NULL OR match_id IS NOT NULL)` kısıtıyla.

**Sonuç.** Tek kuyruk iki farklı inceleme tipini taşıyor. `reason` alanı hangisi
olduğunu ayırt ediyor: `low_classification_confidence` vs `low_match_confidence`.

---

## K-09 · Enum'lar DB'de lowercase, Prisma'da UPPERCASE

**Bağlam.** Kaynak doküman DB enum değerlerinin lowercase snake_case olmasına karar
vermişti. Mevcut Prisma şeması ise UPPERCASE kullanıyordu (`USER`, `ADMIN`).

**Karar.** İkisi de. DB'de lowercase (`facility_admin`), Prisma'da UPPERCASE +
`@map("facility_admin")`.

**Sonuç.** SQL tarafı PostgreSQL konvansiyonuna, TypeScript tarafı TS konvansiyonuna
uyuyor; mevcut auth kodu kırılmıyor. Bedeli: iki taraf elle senkron tutulmalı — enum'a
değer eklerken ikisini de güncelle.

---

## K-10 · Tüm miktarlar kilogram

**Bağlam.** Bir tesis 800 kg giriyor, diğeri 5 ton istiyor. Skorlama karşılaştırma
yapamıyor (E4).

**Karar.** DB'de her miktar kg (`quantity_kg NUMERIC`). Birim dönüşümü frontend'de,
gönderimden önce. Backend sadece kg kabul eder.

**Sonuç.** Sıvı/hacimsel malzemede yoğunluk zorunlu — m³ → kg dönüşümü onsuz yapılamaz.

---

## K-11 · Şema sıfırdan kuruluyor

**Bağlam.** `prisma/schema.prisma` diskte yoktu; sadece `node_modules/.prisma/client/`
içinde üretilmiş bir kopyası vardı (`Osb`, `Facility`, `User`). Migration geçmişi hiç yoktu.
Bir sonraki `npm ci` sonrası şema tamamen kaybolacaktı.

**Karar.** Mevcut üç tabloyu da kapsayan, sıfırdan numaralı migration seti (001-009).

**Sonuç.** Var olan geliştirme veritabanları yeniden kurulmalı. Auth kodu değişmiyor —
üretilen tablolar mevcut Prisma modelleriyle uyumlu (rol enum'u hariç, bkz. K-02).

---

## K-12 · `notifications.type` VARCHAR, ENUM değil

**Bağlam.** `material_class` için ENUM seçtik (K-05). Bildirim tipleri için de aynısı
akla geliyor.

**Karar.** `VARCHAR(50)`, dokümante edilmiş değer listesiyle.

**Sonuç.** Yeni bildirim tipi eklemek migration gerektirmiyor. `material_class`'tan farkı:
bildirim tipleri sorgu filtresi veya iş kuralı girdisi değil, sadece uygulama içi etiket.
Yazım hatasının bedeli düşük, esnekliğin faydası yüksek — `material_class`'ta tam tersi.

---

## K-13 · Şifre sıfırlama ve e-posta doğrulama Faz 0'da

**Bağlam.** Mevcut auth modülünde e-posta doğrulama ve şifre sıfırlama yok. Senaryo S1
bunlara dayanıyor.

**Karar.** Faz 0'a alındı, Faz 1'e bırakılmadı.

**Sonuç.** Faz 0 bir gün uzuyor. Karşılığında S1 Faz 1'de tek parça implemente edilebiliyor;
"tesis kaydı yarım çalışıyor" durumu oluşmuyor.

---

## K-14 · `audit_log.actor_id` FK'sız

**Bağlam.** İlk implementasyonda `actor_id UUID REFERENCES users(id) ON DELETE SET NULL`
idi. Faz 0 testinde şu senaryoda patladı: bir kullanıcı `DELETE /v1/auth/delete-account`
çağırıyor → tesis silinir → `users.facility_id ON DELETE CASCADE` yüzünden kullanıcının
kendi satırı da gider → `AuditInterceptor` işlem bittikten _sonra_ `action='delete'`
kaydı yazmaya çalışıyor → aktör artık `users` tablosunda yok → FK ihlali → INSERT
başarısız. `ON DELETE SET NULL` sadece kullanıcı silinirken **var olan** satırları
günceller; kullanıcı zaten gitmişken **yeni** bir satırın ona referans vermesini
engellemez.

**Karar.** `actor_id` üzerindeki FK kaldırıldı. Artık `entity_id` gibi düz bir UUID
kolonu — referans bütünlüğü DB'de zorlanmıyor.

**Sonuç.** Audit trail, aktör kendi kendini sildikten sonra bile o eylemi doğru şekilde
kaydedebiliyor. Bedel: `actor_id` artık silinmiş bir kullanıcıya işaret edebilir; bunu
okuyan kod (admin paneli, `GET /v1/admin/audit-log`) kullanıcı bulunamama ihtimaline karşı
hazırlıklı olmalı (örn. `LEFT JOIN`, silinmişse "silinmiş kullanıcı" göster).

---

## K-15 · Refresh token hash'i SHA-256, bcrypt değil

**Bağlam.** `/v1/auth/refresh` implementasyonunda refresh token'ı doğrulamak için önce
bcrypt kullanıldı (şifre hash'lemeyle aynı desen). Testte gerçek bir güvenlik açığı
ortaya çıktı: **bcrypt girdisini 72 bayta kırpıyor**. Aynı kullanıcı için üretilen her
refresh JWT'si aynı header ve aynı `{sub, email, role, type}` alanlarıyla başlıyor —
farklılaşan `iat`/`exp` alanları payload'ın sonunda. Bu ortak önek 72 baytı aştığı için
bcrypt, **birbirinden tamamen farklı iki token'ı aynı kabul ediyordu**. Sonuç: token
rotasyonu işe yaramıyordu — eski, iptal edilmiş bir refresh token hâlâ kabul ediliyordu.

**Karar.** Refresh token hash'i için `crypto.createHash('sha256')` kullanılıyor,
karşılaştırma `crypto.timingSafeEqual` ile sabit zamanlı yapılıyor. bcrypt sadece şifre
gibi _düşük entropili, kullanıcı seçimli_ girdiler için kalıyor.

**Sonuç.** Bu, `api_keys.key_hash` için de geçerli bir uyarı: API anahtarları da yüksek
entropili, uzun string'ler olacağı için (Faz 3, görev 3.6) aynı SHA-256 deseni
kullanılmalı, bcrypt değil. Genel kural: **bcrypt yalnızca insan tarafından üretilen
şifreler için; sistem tarafından üretilen token/anahtar için SHA-256 (veya HMAC)**.

---

## K-16 · Şema incelemesi: dört madde (migration 011)

**Bağlam.** Şemanın ilk kararlı hali (migration 001-010) kod incelemesinden geçti.
Altı ayrı noktada tutarsızlık veya eksiklik tespit edildi.

**Maddeler ve kararlar:**

### 1. UserRole: 5 rol tutarlılığı

K-02 ve K-09'da 5 rol belgelenmiş: `user`, `facility_admin`, `expert`, `osb_manager`,
`admin`. Migration `002_enums.sql` bunları `CREATE TYPE user_role AS ENUM (...)` ile
**doğrudan** tanımlıyor — `ALTER TYPE ADD VALUE` kullanılmadı çünkü şema sıfırdan
kuruldu (K-11). **Değişiklik gerekmedi.**

### 2. HumanReviewQueue → Output relation eksikliği

SQL tarafında `output_id UUID REFERENCES outputs(id)` FK zaten vardı (`005_matching.sql`).
Prisma schema'da `output` relation tanımlanmamıştı. Eklendi:

- `HumanReviewQueue.output: Output?`
- `Output.reviewQueueItems: HumanReviewQueue[]`

### 3. Input'ta embedding tracking alanları

`outputs` tablosunda `pending_review` ve `embedding_pending` vardı, `inputs`'te yoktu.
İki taraflı embedding ürettiğimiz için (`record_type = 'input' | 'output'`) Input
tarafında da aynı mekanizma gerekli. Eklendi:

- `inputs.pending_review BOOLEAN DEFAULT FALSE`
- `inputs.embedding_pending BOOLEAN DEFAULT FALSE`

Migration: `011_k10_schema_fixes.sql` (`ALTER TABLE inputs ADD COLUMN`).

### 4. WeightsConfig partial unique index

`007_config.sql` satır 31'de zaten mevcut:

```sql
CREATE UNIQUE INDEX idx_weights_active ON weights_config(active) WHERE active = TRUE;
```

---

## K-17 · Faz 1 öncesi iki şema düzeltmesi (migration 012)

**Bağlam.** Faz 1 modüllerinin altyapısı kurulurken [04-api-sozlesmesi.md](04-api-sozlesmesi.md)
ile şema arasında iki tutarsızlık bulundu.

1. `POST /v1/materials/outputs` gövdesinde `frequency` alanı belgeleniyordu
   (`daily`/`weekly`/`monthly`/`one_time`, `inputs.frequency` ile simetrik) ama
   `outputs` tablosunda bu kolon yoktu.
2. `matches.rejection_reason_category` altı sabit değerden birini almalı
   (`distance_too_far` · `quantity_mismatch` · `quality_insufficient` ·
   `price_too_low` · `timing_unsuitable` · `other`), ama şemada düz `VARCHAR(50)`
   olarak duruyordu — kod tarafında bir yazım hatası sessizce kabul edilirdi.

**Karar.** `outputs.frequency VARCHAR(50)` eklendi. `matches` üzerine
`CHECK (rejection_reason_category IS NULL OR rejection_reason_category IN (...))`
eklendi — `ENUM` değil, çünkü K-07'nin gerekçesiyle aynı: yeni bir kategori eklemek
`ALTER TABLE ADD CONSTRAINT` ile transaction içinde yapılabilir, `ALTER TYPE ADD VALUE`
yapılamaz.

**Sonuç.** `materials` ve `matches` modülleri şemaya güvenerek yazılabilir; geçersiz bir
`rejectionCategory` artık `500` değil DB seviyesinde net bir hata verir (uygulama
katmanı yine de `400 VALIDATION_ERROR` ile önce yakalamalı — DB kısıtı son savunma
hattı).

---

## K-18 · Auth modülü tamamlanıyor: cookie'li refresh, şifre sıfırlama, kayıt alanları

**Bağlam.** [04-api-sozlesmesi.md](04-api-sozlesmesi.md) auth sözleşmesi baştan beri şunu
söylüyor: refresh token `HttpOnly cookie`'de taşınır, `register` gövdesi `contactName`,
`phone`, `osbId`, `location` alanlarını içerir, ve `forgot-password`/`reset-password`
Faz 0 kapsamındadır (K-13). Faz 0 kapanışında bunların hiçbiri koda yansımamıştı: refresh
token hem response body'de hem `RefreshDto.refreshToken` ile request body'de taşınıyordu,
`RegisterDto` sadece `name/taxId/sector/email/password` alıyordu, şifre sıfırlama hiç
yoktu. Şema bu alanları zaten destekliyordu (`facilities.location`, `facilities.osb_id`,
`users.contact_name`, `users.phone` — `003_identity.sql`), sadece auth kodu geride kalmıştı.

**Karar.**
- Refresh token artık `@fastify/cookie` ile `HttpOnly` + `Secure` (prod) + `SameSite=Lax`
  cookie'de taşınıyor; response body'de **görünmüyor**. `POST /v1/auth/refresh` artık
  body almıyor, cookie'yi okuyor. `RefreshDto` kaldırıldı.
- `RegisterDto`'ya `contactName`, `phone`, `osbId?`, `location {lat,lng}` eklendi;
  `location` `ST_MakePoint` ile `$executeRaw` üzerinden yazılıyor (Prisma `Unsupported`
  tipini doğrudan yazamıyor — K-04'ün doğal sonucu).
- `forgot-password` / `reset-password` eklendi. Sıfırlama token'ı, e-posta doğrulamayla
  aynı desende, stateless bir JWT (`type: 'password_reset'`, 1 saat). Ayrı bir
  `password_reset_tokens` tablosu **açılmadı** — email-verify ile simetri korunuyor ve
  MVP için tek kullanımlık zorunluluğu (aynı token iki kez kullanılamasın) kritik değil;
  bu bir bilinen açık olarak not düşülüyor (aşağıya bkz).

**Sonuç.** Auth artık 04'teki sözleşmeyle birebir eşleşiyor. Bilinen açık: stateless
reset/verify JWT'leri, süresi dolana kadar birden çok kez kullanılabilir (klasik
tek-kullanımlık token invalidation'ı yok). Gerçek bir saldırı yüzeyi değil (token e-posta
kutusuna gidiyor, çalınması ayrı bir sorun) ama Faz 2'de bir `used_at` kolonu ile
sağlamlaştırılabilir.

---

## K-19 · Migration 011 "uygulandı" yazıyordu ama canlı DB'de hiç çalışmamıştı

**Bağlam.** `materials` modülü yazılıp `POST /v1/materials/inputs` test edilirken sunucu
`500` döndü: `The column "inputs.pending_review" does not exist`. Oysa
`011_k10_schema_fixes.sql` dosyası diskte vardı, `schema.prisma` bu kolonları
içeriyordu, K-16 bunu "tamamlandı" olarak belgeliyordu, ve
[08-yol-haritasi.md](08-yol-haritasi.md)'nin migration tablosu 011'i "uygulandı" olarak
listeliyordu. `information_schema.columns` ile canlı Supabase'e doğrudan bakıldığında
gerçek: `inputs.pending_review`, `inputs.embedding_pending` ve `messages.session_id`
**hiçbirinin DB'de karşılığı yoktu**. Migration dosyası muhtemelen bir önceki oturumda
yazıldı, `schema.prisma`/dokümanlar buna göre güncellendi, ama `prisma db execute`
komutu hiç çalıştırılmadı (veya sessizce başarısız oldu) ve bu fark edilmedi çünkü o an
bu kolonları okuyan/yazan hiçbir kod yoktu.

**Karar.** `011_k10_schema_fixes.sql` şimdi (idempotent olduğu için sorunsuzca) yeniden
çalıştırıldı, `information_schema` ile doğrulandı. Kod değişikliği gerekmedi — sorun
migration dosyasında değil, onu **uygulama adımının atlanmasındaydı**.

**Sonuç.** "Migration dosyası var + dokümanlar 'tamamlandı' diyor" bunun canlı DB'ye
gerçekten uygulandığının **kanıtı değil**. Bir migration'ı "tamamlandı" işaretlemeden
önce ilgili tabloyu/kolonu `information_schema.columns` ile veya en azından o kolonu
kullanan bir uçtan-uca istekle doğrulamak gerekiyor — bu, testin (materials modülü)
sadece kod doğruluğunu değil, önceki "tamamlandı" işaretlerinin doğruluğunu da
sınadığını gösteriyor.

---

## K-20 · `materials` modülü kapsamı: CRUD var, AI/DPP/embedding yok

**Bağlam.** Faz 1.3 (`materials` modülü) yazılırken AI servisi (Faz 1.4-1.5) ve
`DPPGenerator` (Faz 1.6) henüz yok. [06-senaryolar.md](06-senaryolar.md) S2'nin kabul
kriterleri `outputs`, `embeddings`, `material_passports` tablolarına birer kayıt
eklenmesini ve cevapta `qrCode`/`pdfUrl` bulunmasını istiyor — bunların hepsi tam
olarak karşılanamaz durumda.

**Karar.**
- `POST /v1/materials/outputs|inputs` sadece CRUD yapıyor. `embeddingPending` her zaman
  `true` (embedding hiç hesaplanmıyor). `passportId`/`qrCode`/`pdfUrl` `null` dönüyor —
  `material_passports` satırı hiç açılmıyor; yarım/uydurma bir ESPR JSON'u üretip
  1.6'da baştan yazmaktansa, alanları dürüstçe boş bırakmayı tercih ettik.
- `materialClass` her iki modelde de **opsiyonel** — şemanın zaten desteklediği
  (`material_class` nullable) HITL akışına uyumlu: boş geçilirse `pendingReview = true`.
- `VerifiedFacilityGuard` sadece **create** (`POST`) endpoint'lerine kondu. 04'teki
  "Tümü facility.verified=true gerektirir" ifadesi kelimenin tam anlamıyla okunursa
  GET/PATCH/DELETE'i de kapsar, ama CLAUDE.md'nin domain kuralı daha kesin:
  "unverified bir tesis materyal **oluşturamaz**". İkisi çeliştiğinde CLAUDE.md'nin
  kesin ifadesi esas alındı; pratikte fark etmiyor çünkü doğrulanmamış bir tesisin zaten
  görüntüleyecek bir kaydı olamaz (create engellendiği için).
- `DELETE /v1/materials/outputs/:id`'de aktif eşleşme (`pending`/`accepted`) varsa `409`.
  Aynı kısıt `inputs` için **eklenmedi** — 04 sadece outputs için belirtiyor, ve
  `Match.input` FK'sı zaten `ON DELETE CASCADE` (bilinçli, `005_matching.sql`).

**Sonuç.** Faz 1.3 tek başına "yarım" bir kayıt üretiyor — bu roadmap'in kendi
sıralama notunda zaten kabul edilmiş bir durum ("1.4 ve 1.5, 1.3'ten hemen sonra
gelmeli"). Frontend, `passportId: null` / `qrCode: null` durumunu "DPP henüz üretiliyor"
olarak ele almalı.

---

## K-21 · DPP üretimi AI'sız tamamlandı: HMAC anahtarı, PDF/QR kütüphaneleri, eksik alanlar

**Bağlam.** Faz 1.6 (DPPGenerator) AI servisine bağımlı değil — ESPR uyumu, PDF, QR hepsi
yerel hesaplama/kütüphane işi. `POST /v1/materials/outputs` artık DPP'yi senkron üretiyor
(S2'nin performans hedefi zaten PDF üretimini 2 saniyelik bütçeye dahil ediyor).

**Kararlar.**
- **İmza anahtarı:** Ayrı bir `DPP_SIGNING_SECRET` açılmadı, `JWT_SECRET_KEY` yeniden
  kullanılıyor. Gerekçe: ikisi de "backend'in kendi ürettiğini kanıtlayan sır" — modest
  deploy hedefi için ayrı bir zorunlu env değişkenine değmiyor. Prod'da segregasyon
  isteniyorsa `PUBLIC_BASE_URL` yanına eklenebilir.
- **Kütüphaneler:** `pdfkit` (PDF) ve `qrcode` (PNG) eklendi — ikisi de saf JS, native
  bağımlılık yok, deploy'u ağırlaştırmıyor.
- **Şemada karşılığı olmayan DPP alanları:** `05-is-kurallari.md`'deki örnek JSON
  `physical_properties` (state/moisture/density) ve `origin.process`/`batch` içeriyor ama
  `outputs` tablosunda bu veriler hiç yok. `physical_properties` bölümü tamamen atlandı,
  `origin.process`/`batch` `null` bırakıldı — üretim tarihi (`origin.production_date`)
  ise `output.createdAt`'ten türetiliyor (ayrı bir alan istemekten daha basit ve mevcut
  API sözleşmesini bozmuyor). `environmental_impact` de atlandı — `CBAMCalculator`
  (Faz 1.9) bir eşleşmeye bağlı çalışıyor, bağımsız bir çıktı için hesaplanamaz.
- **PDF/QR tek seferlik:** DPP, PDF ve QR **sadece oluşturmada** üretiliyor. `PATCH`
  bunları yeniden üretmiyor (docs/04 sadece "embedding yeniden hesaplanır" diyor, DPP'den
  bahsetmiyor) — bilinçli bir basitleştirme, aksi hâlde eski PDF dosyasının temizlenmesi
  gerekirdi.

**Sonuç.** `material_passports.passport_data` dokümandaki tam ESPR şemasının bir alt
kümesi — eksik alanlar `null`/atlanmış, ama `compliance.issues[]` her zaman doğru
(gerçekten eksik olan tek kontrol edilebilir şey composition/material_class/location/
production_date). Şema ileride `outputs`'a fiziksel özellik kolonları eklerse bu servis
genişletilebilir.

---

## K-22 · Idempotency-Key: process-içi Map, Redis değil

**Bağlam.** Faz 1.11, E3'ün üçüncü savunma katmanı. Roadmap Redis'i "pending_embeddings"
kuyruğu için zaten öngörüyordu ama Redis hiç kurulmadı (docker-compose'da var, kodda yok).

**Karar.** `IdempotencyInterceptor` tek process içi bir `Map` kullanıyor,
`Idempotency-Key` + kullanıcı + method + path'i anahtarlıyor, 24 saat TTL, sadece 2xx
cevapları cache'liyor (bir doğrulama hatasını kalıcı olarak cache'lemek istemiyoruz —
kullanıcı düzeltip aynı anahtarla tekrar denerse yeniden denemeli).

**Sonuç.** Tek instance'lı MVP deploy'u için doğru davranır. **Yatay ölçeklemeye
geçilirse** (birden fazla backend process'i) bu cache Redis'e taşınmalı, aksi hâlde her
instance kendi cache'ini tutar ve aynı istemci farklı instance'lara denk gelirse dedup
bozulur. Şimdiden bu riski üstlenmek yerine not düşülüyor.

---

## K-23 · Matches state machine: enum case-mismatch bug (testte bulundu), gizlilik açığı

**Bağlam.** Faz 1.10 (accept/reject/contact) yazılırken `find`/`ScoringEngine` henüz yok
(Faz 1.7-1.8, embedding'e bağımlı) — bu yüzden testler `Match` satırlarını doğrudan
Prisma ile fixture olarak açıyor, tıpkı gerçek bir eşleştirmenin göreceği şekilde.

**Gerçek hata (testte bulundu).** `accept()` satır kilidi için `$queryRaw ... FOR UPDATE`
kullanıyor. Raw SQL, DB'nin **lowercase** enum değerini olduğu gibi döner
(`'pending'`), ama kod bunu Prisma Client'ın **UPPERCASE** enum değeriyle
(`MatchStatus.PENDING === 'PENDING'`) karşılaştırıyordu — K-09'un tam olarak uyardığı
sınır. Karşılaştırma sessizce hep `false` dönüyordu, yani her `accept()` çağrısı yanlışlıkla
"tamamlama" dalına düşüyordu: ilk taraf kabul ettiğinde eşleşme hemen `completed`
oluyor, stok İKİ KEZ düşüyor, hatta **reddedilmiş bir eşleşme bile `accept` ile tekrar
`completed`'e dönebiliyordu**. 8 e2e testi bunu yakaladı (durum geçişleri, stok miktarı,
reddedilmiş eşleşmenin kilitli kalması). **Karar:** raw sorgudan dönen `status` artık
`.toUpperCase()` ile normalize ediliyor, karşılaştırmalar ondan sonra yapılıyor.

**Bilinen açık (düzeltilmedi, bilinçli).** Eşleşme listesi/detayında `approximateLocation`
(S3'ün örnek yanıtındaki yaklaşık konum) döndürülmüyor — "yaklaşık" olmanın ne kadar
yuvarlama demek olduğu hiçbir yerde tanımlı değil. `osbName` + `sectorLabel` ile gizlilik
kuralı zaten sağlanıyor (gerçek isim/adres/iletişim hiçbir zaman `completed` öncesi
görünmüyor); konum sadece bir "yakınlık hissi" veriyor, eksikliği S3'ün özünü bozmuyor.

---

## K-24 · `AiClientService` dummy: sözleşme gerçek, içerik değil

**Bağlam.** Ekip arkadaşının AI servisi (ayrı repo, MIT'nin bir eşleştirme modelini
kullanacak) henüz hazır değil. Faz 1'in geri kalanı (`ai/classify`, embedding üretimi,
`matches/find` + skorlama) bu servise bağımlıydı. Roadmap'in kendi önerisi ("Sahte bir
`/embed` ile 1.7 ve 1.8 geliştirilebilir") buradaki yaklaşımı zaten öngörüyordu.

**Karar.** `AiClientService` docs/07'deki sözleşmeyi (`classify`/`embed` girdi-çıktı
şekli) birebir uyguluyor ama içi dummy:
- `classify()`: metnin hash'inden deterministik bir `materialClass` + `confidence`
  (0.45-0.90 aralığı) + `top3` üretir. Aynı metin her zaman aynı sonucu verir (test
  edilebilirlik için), farklı metin farklı sonuç verir (sabit/hardcoded cevap değil).
- `embed()`: rastgele 768 boyutlu, L2-normalize edilmiş bir vektör üretir
  (`normalized: true` iddiası gerçek — pgvector'ün cosine mesafesi bunu gerektiriyor).
- Retry/circuit breaker (docs/07: 3 deneme, 500ms→1s→2s, %50 hata eşiği) **eklenmedi** —
  sahte bir çağrının başarısız olması diye bir şey yok. Gerçek HTTP istemcisi yazılırken
  eklenmesi gereken yer `ai-client.service.ts` içinde açıkça yorumlandı.

Bunun üzerine inşa edilen her şey **gerçek**: `POST /v1/ai/classify` backend'in kendi
HITL eşiğini (`system_config['match.hitl_threshold']`) kontrol ediyor (docs/07: "tek
kaynağa güvenmiyoruz"); `EmbeddingsService` gerçek `buildEmbeddingText()` + pgvector
yazımı yapıyor; `GET /v1/matches/find/:outputId` gerçek pgvector benzerlik araması,
gerçek 5 faktörlü skor (docs/05 formülleri), gerçek CBAM hesabı çalıştırıyor — sadece
girdi vektörleri anlamsız.

**Sonuç.** Gerçek AI servisi geldiğinde tek değişen dosya `ai-client.service.ts` olacak
(HTTP istemcisiyle değişecek, retry/CB o zaman eklenecek); `AiService`, `EmbeddingsService`,
`ScoringService`, `MatchesService` hiç dokunulmadan çalışmaya devam edecek. Eşleşme
kalitesi şu an anlamsız (rastgele vektörler arası benzerlik ~0) — test edilirken
`embeddings` tablosuna doğrudan bilinen bir vektör yazılarak (bkz. `find.test.js`)
deterministik hâle getirildi. Ekonomik skor için gereken malzeme fiyatları da (`virgin`/
`secondary` EUR/kg) hiçbir dokümanda yoktu; `scoring.service.ts` içinde açıkça
yer tutucu olarak işaretlenmiş sabit bir tabloyla dolduruldu (AD2 kalibrasyonu bekliyor).

---

## K-25 · `embeddings` yetim satırları: doğrudan silmede temizleniyor, cascade'de değil

**Bağlam.** [03-veri-modeli.md](03-veri-modeli.md) "embeddings polimorfik FK kullanıyor...
input/output silindiğinde embedding'i uygulama temizler" diyordu — ama embedding üretimi
bu oturuma kadar hiç yoktu, yani bu iddia hiç test edilmemişti. `materials`/`matches`/
`find` testleri art arda koşulduğunda 21 yetim `embeddings` satırı biriktiği fark edildi.

**Kök sebep.** `deleteOutput`/`deleteInput` (materials.service.ts) embedding satırını
gerçekten silmiyordu — sadece `outputs`/`inputs` satırı gidiyordu. Daha da önemlisi,
`DELETE /v1/auth/delete-account` tesisi silince `outputs`/`inputs` DB seviyesinde
`ON DELETE CASCADE` ile gidiyor — bu yol `materials.service.ts`'in hiçbir metodundan
geçmiyor, dolayısıyla oradaki temizlik kodu bile bu senaryoda hiç çalışmıyor.

**Karar.** `deleteOutput`/`deleteInput` artık kendi embedding satırını da siliyor —
bu, **doğrudan** `DELETE /v1/materials/outputs|inputs/:id` çağrısı yolunu düzeltiyor.
Hesap/tesis silme cascade'i için bir düzeltme **yapılmadı** — auth modülünün materials
tablolarını bilmesi gerekirdi, bu sınırı bulanıklaştırırdı. Bunun yerine test paketinin
`cleanup.test.js`'i artık her koşuda yetim embedding'leri süpürüyor (`record_id`'si
`outputs`/`inputs`'ta artık olmayan satırlar).

**Sonuç.** Prod'da hesap silme sonrası birkaç KB'lık yetim `embeddings` satırı kalabilir
— zararsız (hiçbir sorgu onlara join ile ulaşamaz, referans verdiği kayıt yok) ama disk
kullanımı zamanla birikir. Gerçek çözüm ya bir Postgres trigger'ı ya da
`deleteAccount`'a (auth.service.ts) açık bir `embeddings` temizliği eklemek olurdu;
ikisi de bu oturumun kapsamı dışında bırakıldı, ileride ele alınmalı.

---

## K-26 · `human_review_queue` sadece output'u kapsıyor, input'u değil

**Bağlam.** Şema (`human_review_queue.output_id`/`match_id`, ikisi de nullable) hem çıktı
sınıflandırma incelemesini hem de eşleşme itirazını aynı tabloda taşıyacak şekilde
tasarlanmıştı (K-08). Faz 2'de sadece HITL sınıflandırma akışı (A2) uygulandı.

**Karar.** `materials.service.ts`'in `createOutput()`'u sınıfsız kalan **çıktılar** için
kuyruk satırı açıyor; **girdiler** (`inputs`) için eşdeğer bir akış hiç yazılmadı — girdi
oluşturmada `materialClass` opsiyonel olsa da sınıfsız kalması HITL'i tetiklemiyor,
sessizce `pendingReview` benzeri bir durumda kalmıyor bile (zaten `inputs` tablosunda böyle
bir alan var ama hiç set edilmiyor).

**Sonuç.** Girdi tarafının HITL kapsamına alınması ayrı bir görev olarak roadmap'e
eklenmeli (docs/08). `match_id` üzerinden eşleşme itirazı akışı da (şemada yer var) henüz
hiç kullanılmıyor — ikisi de bilinçli olarak bu oturumun kapsamı dışında bırakıldı.

---

## K-27 · DPP raporu kendi `reports` satırını açamıyor

**Bağlam.** `reports` tablosu `match_id NOT NULL` ile tasarlandı — her rapor bir eşleşmeye
bağlı varsayıldı (environmental/CBAM raporları için doğru). Ama DPP pasaportu bir
**çıktıya** bağlı, bir eşleşmeye değil; `GET /v1/reports/dpp/:passportId` bir eşleşme
olmadan da (henüz hiç eşleşmemiş bir çıktı için bile) çağrılabilmeli.

**Karar.** `getDppReport()` `reports` tablosuna hiç yazmıyor — doğrudan
`material_passports`'u sahip-tesis kimlik doğrulamasıyla okuyup döndürüyor. Bu, diğer
rapor tiplerinden farklı bir yol (onlar `reports` satırı açıp donmuş bir kopya tutuyor,
AD3) ama DPP zaten kendi imzalı/donmuş `passport_data`'sını `material_passports`'ta
saklıyor (K-21), ayrıca donacak bir şey yok.

**Sonuç.** `GET /v1/reports` (geçmiş rapor listesi) DPP görüntülemelerini hiç
göstermiyor — sadece environmental/CBAM. Şema `reports.match_id`'yi nullable yapacak
şekilde değiştirilirse (yeni bir migration) bu tutarsızlık giderilebilir; şimdilik
bilinçli bir sınır olarak bırakıldı.

---

## K-28 · Register/login rate limiti prod dışında gevşetildi

**Bağlam.** docs/04'ün rate limit tablosu `POST /v1/auth/register`'ı 3/saat/IP,
`POST /v1/auth/login`'i 5/15dk/IP olarak sabitliyor. E2E test paketi tek bir çalıştırmada
aynı IP'den (localhost) 5'ten fazla facility kaydediyor ve defalarca giriş yapıyor —
bu limitler olduğu gibi uygulansaydı test paketi kendi kendini kilitlerdi.

**Karar.** K-18'in `NODE_ENV==='production'` deseniyle (refresh cookie'nin `secure`
bayrağı için kullanılan) aynı yaklaşım: `auth.controller.ts`'te
`IS_PRODUCTION ? gerçek_limit : 1000` üzerinden limitler prod dışında gevşetiliyor.
`app-throttler.guard.ts`'in kullanıcı bazlı izleme mantığı (JWT `sub`'ı decode etme)
değişmedi, sadece bu iki endpoint'in limit değerleri ortam bazlı.

**Sonuç.** Prod limitleri docs/04 ile birebir korunuyor; sadece geliştirme/test ortamında
gevşetildi. `/v1/ai/classify`'ın 60/dk limiti gevşetilmedi çünkü kullanıcı bazlı izleniyor
(her test dosyası kendi kullanıcısını açıyor, IP gibi paylaşılan bir kova değil) ve zaten
`ai.test.js`'in kendi burst testi bunu bilerek aşıyor.

---

## K-29 · `AuditInterceptor` entity id çözümü output/input'u tanımıyordu

**Bağlam.** `admin-extra.test.js`'in "bu paketin oluşturduğu çıktı kayıtları audit_log'da
görünüyor" testi başarısız oldu. `AuditInterceptor.write()`'ın entity id çözüm zinciri
sadece `request.params.id`, `result.facility.id` ve `result.id`'yi deniyordu —
`createOutput`/`createInput`'un döndürdüğü `{outputId, ...}`/`{inputId, ...}` şekli hiç
eşleşmiyordu, audit_log yazımı sessizce atlanıyordu (interceptor hatayı yutmuyor,
sadece `entityId` bulunamadığında early-return yapıyor).

**Karar.** Çözüm zinciri genişletildi:
`outputId ?? inputId ?? matchId ?? userId ?? passportId ?? documentId`. Genel bir çözüm
(ör. tüm olası alan adlarını bir yapılandırmadan okumak) yerine bilinen tüm örüntülerin
sırayla denenmesi tercih edildi — mevcut endpoint sayısı için yeterli, aşırı mühendislik
gerekmiyor.

**Sonuç.** Yeni bir endpoint `@Audit()` ile işaretlenip yanıtında bu listede olmayan bir
id alanı döndürürse aynı sessiz atlama tekrar yaşanır — yeni bir alan adı eklemek yeterli,
ama bu sınıf hatanın code review ile değil sadece e2e testle yakalanabildiği unutulmamalı.

---

## K-30 · Idempotency-Key eşzamanlı istek koruması + test dosyalarının cwd bağımlılığı

**Bağlam.** İki ayrı ama aynı oturumda bulunan gerçek hata:

1. `IdempotencyInterceptor`'ın cache'i sadece **tamamlanmış** bir isteğin sonucunu
   tutuyordu. Aynı anahtarla eşzamanlı gelen ikinci istek (ör. istemci ağ gecikmesi
   yüzünden gerçekten aynı anda iki bağlantı açarsa) cache'i boş bulup handler'ı BİR DAHA
   çalıştırabiliyordu — aynı kaydı iki kez oluşturarak (yanıt gövdesinde tek bir sonuç
   görünse bile, ikincisi cache'e yazılmadan önce).
2. `admin-extra.test.js`/`cleanup.test.js` diskteki `training/` dosyalarını
   `process.cwd()` ile arıyordu. Sunucu her zaman `backend/` kökünden çalıştığı için
   aynı varsayımla yazıyor, ama testin kendi `process.cwd()`'i `npm test`'in nereden
   tetiklendiğine bağlı olarak farklılaşabiliyor — tam da `helpers.js`'in `.env`
   yüklemesinde daha önce çözdüğü sorunun aynısı.

**Karar.**
1. `IdempotencyInterceptor`'a `inFlight` adlı ikinci bir `Map` eklendi: bir istek
   `next.handle()`'ı çağırmadan ÖNCE, paylaşılan (RxJS `shareReplay`) bir Observable'ı bu
   map'e senkron olarak (await olmadan) yazıyor. Aynı anahtarla gelen ikinci istek
   (gerçekten eşzamanlı olsa bile, Node'un tek thread'li olay döngüsünde araya girecek bir
   pencere kalmadığı için) handler'ı tekrar çağırmak yerine BİRİNCİNİN sonucuna abone
   oluyor.
2. `helpers.js`'e `BACKEND_DIR` (`fileURLToPath(new URL('..', import.meta.url))`) eklendi;
   dosya sistemi kontrolü yapan tüm test dosyaları `process.cwd()` yerine bunu kullanıyor.

**Sonuç.** Idempotency artık hem "aynı anahtarla art arda" hem "aynı anahtarla eşzamanlı"
durumlarda tek bir gerçek kayıt garantiliyor. Test dosyalarının disk yolu artık `npm
test`'in hangi dizinden çalıştırıldığından bağımsız.

---

## K-31 · `ClaudeClientService` dummy: chatbot sözleşmesi gerçek, içeriği değil

**Bağlam.** Faz 3.3 (`ChatbotProxy`) gerçek bir Claude API entegrasyonu istiyor
(docs/06 S6). `AiClientService`'in aksine (K-24) bu servis EcoMatch'in kendi backend'inin
sorumluluğunda — ayrı bir ekip/repo bağımlılığı yok — ama gerçek bir Anthropic API
anahtarı gerektiriyor ve gerçek bir çağrı e2e test paketinde her koşuda gerçek paraya
mal olurdu.

**Karar.** `AiClientService` ile aynı dummy felsefesi uygulandı: `ClaudeClientService`
anahtar kelime eşleştirmeli kanned yanıtlar üretiyor (`dpp`, `cbam`, `eşleş` gibi
terimlere göre), 12 karakterlik parçalar hâlinde `async generator` ile "streaming"
taklit ediyor. Üzerine kurulu her şey gerçek: SSE ile parça parça teslim
(`chat.controller.ts`, Fastify `reply.raw`), `messages` tablosuna user+assistant kaydı,
son 10 mesajlık context okuma, session devamlılığı ve sahiplik kontrolü, 10/dk + 50/gün
rate limit. "Claude API down" senaryosunu (S6) gerçekten kanıtlayabilmek için dummy
istemci özel bir sentinel mesajda (`__SIMULATE_CLAUDE_DOWN__`) bilinçli olarak
`ServiceUnavailableException` fırlatıyor — `AiClientService`'te olmayan, sadece bu
senaryoyu test edebilmek için eklenmiş bir test kancası.

**Sonuç.** Gerçek Anthropic SDK entegrasyonu geldiğinde tek değişecek dosya
`claude-client.service.ts` olacak (`stream()` metodunun içi bir SDK streaming çağrısıyla
değişecek); `ChatService`/`ChatController` hiç dokunulmadan çalışmaya devam edecek.
Yanıtların içeriği şu an anlamsız (sabit kanned metin) — semantik olarak gerçek bir LLM
değil, sadece akış/kayıt/rate-limit mekaniği gerçek.

---

## K-32 · IoT sensör alımı: MQTT yerine HTTP + API key

**Bağlam.** Faz 3.7 roadmap'te `MQTTSubscriber` + `IoTHandler` olarak tanımlıydı
(docs/06 I1: sensör `facility/xyz/tank/A` topic'ine MQTT ile yayınlıyor). IoT modülü
docs'ta zaten "opsiyonel" olarak işaretli ve roadmap'te en düşük öncelik (D). Bu ortamda
test edilebilir bir MQTT broker'ı (Mosquitto) yok, ve `mqtt` paketini eklemek "deploy
hedefi mütevazı, gerekçesiz bağımlılık eklenmez" ilkesiyle çelişirdi -- özellikle
gerçek bir broker'a bağlanmadan test edilemeyecek bir bağımlılık için.

**Karar.** Gerçek MQTT alt yapısı kurulmadı. Bunun yerine `POST /v1/iot/sensor-data`
(yeni bir `ApiKeyGuard`, JWT değil `X-Api-Key` header'ı — docs/03: "api_key ayrı bir
kimlik doğrulama yöntemi") gerçek bir MQTT mesaj işleyicisinin yapacağı işi birebir
yapıyor: `sensor_data` yazımı, `outputs.stock` güncelleme, %20 eşiğinde `low_stock`
bildirimi, stok tam 0'a düştüğünde aktif eşleşmedeki karşı tarafa `output_depleted`
bildirimi (docs/06 I1). API anahtarı SHA-256 hash'leniyor (K-15 ile aynı kural).
Bağlantı kaybı izleme (I2) gerçek bir `@Cron(EVERY_5_MINUTES)` job'u: son bildirim tipini
(`sensor_offline`/`sensor_online`) "bilinen durum" olarak kullanıyor, süreç içi bir
değişken değil, sunucu yeniden başlasa bile kaybolmuyor.

**Sonuç.** Sadece TAŞIMA katmanı (MQTT wire protokolü) eksik — alım mantığının kendisi
tamamen gerçek ve test edilmiş (`iot.test.js`). Gerçek bir MQTT broker'ı devreye
alındığında yapılması gereken tek şey bir MQTT abone servisinin gelen mesajı bu
endpoint'in çağırdığı aynı `IotService.ingest()` metoduna iletmesi — iş mantığı hiç
değişmeyecek.

**Not.** Gerçek bir `mqtt` istemcisi + Mosquitto (Docker Compose) + paylaşılan bir
`ApiKeyService` ile bu wire-up bir kez denendi; kod derleniyordu ama yerel Docker Desktop
kurulumu (bu depoyla ilgisiz, önceden var olan bir `sailor-ingest.sock` hatası) canlı bir
broker'a karşı uçtan uca doğrulamayı engelledi. Doğrulanamayan bir özelliği depoda
bırakmamak için geri alındı. Docker sorunu çözülürse aynı tasarım (yukarıdaki paragraf)
tekrar uygulanabilir.

---

## K-33 · Sunucu tarafı benzerlik tespiti: aynı facility + aynı description + 5 dakika

**Bağlam.** Faz 1.11'in ikinci katmanı (Idempotency-Key, K-22) zaten gerçekti; üçüncü
katman (docs/06 E3: "Sunucu tarafı benzerlik") hiç yazılmamıştı. `CreateOutputDto`'da
`confirmDuplicate` alanı önceden "rezerve" olarak eklenmişti ama hiçbir mantık ona
bakmıyordu.

**Karar.** `MaterialsService.checkPossibleDuplicate()`: aynı `facility_id` + **birebir
aynı** `description` (embedding benzerliği değil, tam string eşleşmesi) + son 5 dakika
içinde bir kayıt varsa `409 POSSIBLE_DUPLICATE` döner. İstemci `confirmDuplicate: true`
ile kontrolü bilerek atlayıp devam edebilir (gerçekten aynı malzemeden iki ayrı parti
olabilir). Hem `createOutput` hem `createInput` için uygulandı — E3'ün başlığı "duplicate
**malzeme** kaydı", ikisine de eşit derecede uygulanabilir bir kural.

**Gerçek hata (testte bulundu).** İlk yazımda `duplicateId` yanıt gövdesinin KÖKÜNE
konmuştu (`{error, message, duplicateId}`). `HttpExceptionFilter.buildBody()` yalnızca
`error`/`message`/`details` alanlarını geçiriyor — `duplicateId` sessizce düşüyordu,
istemci hiçbir zaman göremiyordu. `RATE_LIMIT_EXCEEDED`'in `details.retryAfterSeconds`
örüntüsüyle aynı şekilde `details: { duplicateId }` içine taşındı.

**Sonuç.** İdempotency-Key (katman 2, tam olarak aynı anahtar → tam olarak aynı yanıt) ile
bu katmanın (katman 3, içerik benzer ama anahtar farklı/yok) birbirini tamamladığı
doğrulandı: aynı Idempotency-Key'le gelen bir tekrar bu kontrole hiç uğramıyor (interceptor
zaten handler'ı çalıştırmıyor), sadece YENİ bir anahtarla (veya hiç anahtarsız) gelen ama
içerik olarak şüpheli istekler bu katmana takılıyor.
