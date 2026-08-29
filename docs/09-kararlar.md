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

## K-16 · Şema incelemesi: altı madde (migration 011)

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
