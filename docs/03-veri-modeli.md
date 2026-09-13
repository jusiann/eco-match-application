# 03 · Veri Modeli

> **Kaynak kuralı:** `backend/prisma/migrations/*.sql` şemanın tek gerçek kaynağıdır.
> `schema.prisma` bunun Prisma tarafındaki yansımasıdır, tersi değil.
> `prisma migrate dev` **çalıştırılmaz** — pgvector ve PostGIS kolonlarını bozar.
> Gerekçe: [09-kararlar.md](09-kararlar.md) K-04.

## Eklentiler

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector, VECTOR(768) + HNSW
CREATE EXTENSION IF NOT EXISTS postgis;    -- GEOGRAPHY, ST_Distance
```

## Enum'lar

DB'de değerler **lowercase snake_case**. Prisma tarafında UPPERCASE + `@map(...)`.
İki taraf elle senkron tutulur.

| Enum             | Değerler                                                                               | Not                                                            |
| ---------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `user_role`      | `user` · `facility_admin` · `expert` · `osb_manager` · `admin`                         | `api_key` bir rol **değil** — `api_keys` tablosunda            |
| `material_class` | `metal` · `plastic` · `organic` · `chemical` · `textile` · `glass` · `paper` · `other` | Yeni değer eklemek migration gerektirir (AD5)                  |
| `record_type`    | `input` · `output`                                                                     | `embeddings` polimorfik FK'sı için                             |
| `match_status`   | `pending` · `accepted` · `rejected` · `completed` · `expired`                          | Durum makinesi: [05](05-is-kurallari.md)                       |
| `report_type`    | `environmental` · `cbam` · `dpp`                                                       |                                                                |
| `chat_role`      | `user` · `assistant`                                                                   |                                                                |
| `review_status`  | `pending` · `approved` · `rejected`                                                    | `facility_verification` ve `human_review_queue` ortak kullanır |

```sql
CREATE TYPE user_role      AS ENUM ('user','facility_admin','expert','osb_manager','admin');
CREATE TYPE material_class AS ENUM ('metal','plastic','organic','chemical','textile','glass','paper','other');
CREATE TYPE record_type    AS ENUM ('input','output');
CREATE TYPE match_status   AS ENUM ('pending','accepted','rejected','completed','expired');
CREATE TYPE report_type    AS ENUM ('environmental','cbam','dpp');
CREATE TYPE chat_role      AS ENUM ('user','assistant');
CREATE TYPE review_status  AS ENUM ('pending','approved','rejected');
```

---

## Kimlik ve tesis

### `osbs`

Organize Sanayi Bölgesi. `region` bir poligon — bir tesisin hangi OSB sınırları içinde
olduğunu doğrulamak ve bölgesel agregasyon yapmak için.

| Kolon        | Tip                        | Not                 |
| ------------ | -------------------------- | ------------------- |
| `id`         | `UUID PK`                  | `gen_random_uuid()` |
| `name`       | `VARCHAR(255) NOT NULL`    |                     |
| `city`       | `VARCHAR(100) NOT NULL`    |                     |
| `region`     | `GEOGRAPHY(POLYGON, 4326)` | PostGIS, nullable   |
| `created_at` | `TIMESTAMP DEFAULT NOW()`  |                     |

### `facilities`

| Kolon                       | Tip                           | Not                                                            |
| --------------------------- | ----------------------------- | -------------------------------------------------------------- |
| `id`                        | `UUID PK`                     |                                                                |
| `name`                      | `VARCHAR(255) NOT NULL`       |                                                                |
| `tax_id`                    | `VARCHAR(20) NOT NULL UNIQUE` | VKN, 10 hane. Aynı VKN ile ikinci kayıt → 409 (S1)             |
| `sector`                    | `VARCHAR(150) NOT NULL`       |                                                                |
| `location`                  | `GEOGRAPHY(POINT, 4326)`      | **Nullable** — legacy kayıtlar için (E6). Yeni kayıtta zorunlu |
| `osb_id`                    | `UUID FK → osbs`              | `ON DELETE SET NULL`. "Bağımsız" tesis için NULL               |
| `verified`                  | `BOOLEAN DEFAULT FALSE`       | Admin onayı. `false` iken malzeme eklenemez (S1)               |
| `created_at` / `updated_at` | `TIMESTAMP`                   |                                                                |

> `location` NULL ise lojistik skoru hesaplanamaz. Hata değil, **ceza**: `logisticsScore = 0`
> ve UI'de "karşı tesis konumu bilinmiyor" uyarısı (E6).

### `users`

| Kolon            | Tip                                 | Not                                                                                                           |
| ---------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `id`             | `UUID PK`                           |                                                                                                               |
| `facility_id`    | `UUID FK → facilities NOT NULL`     | `ON DELETE CASCADE`                                                                                           |
| `email`          | `VARCHAR(255) NOT NULL UNIQUE`      | Daima lowercase saklanır                                                                                      |
| `password_hash`  | `VARCHAR(255) NOT NULL`             | bcrypt, cost 10                                                                                               |
| `role`           | `user_role NOT NULL DEFAULT 'user'` | Kayıtta ilk kullanıcı → `facility_admin`                                                                      |
| `contact_name`   | `VARCHAR(150)`                      | S4'te karşı tarafa açılan yetkili kişi                                                                        |
| `phone`          | `VARCHAR(30)`                       | S4'te karşılıklı onay sonrası açılır                                                                          |
| `email_verified` | `BOOLEAN DEFAULT FALSE`             | S1 adım 5. Token 24 saat geçerli                                                                              |
| `refresh_token`  | `VARCHAR(255)`                      | SHA-256 hash'i saklanır, ham token değil. **bcrypt kullanılmaz** — bkz. [09-kararlar.md](09-kararlar.md) K-15 |
| `last_login`     | `TIMESTAMP`                         |                                                                                                               |
| `created_at`     | `TIMESTAMP DEFAULT NOW()`           |                                                                                                               |

> **`email_verified` ile `facility.verified` farklı şeylerdir.** İlki e-posta sahipliği,
> ikincisi belge onayı. Aylin e-postasını doğruladıktan sonra giriş yapabilir ama tesisi
> onaylanana kadar malzeme ekleyemez.

### `api_keys`

`api_key` bir rol değil, ayrı bir kimlik yöntemi. IoT sensörleri ve entegrasyonlar için.

| Kolon                                     | Tip                            | Not                              |
| ----------------------------------------- | ------------------------------ | -------------------------------- |
| `id`                                      | `UUID PK`                      |                                  |
| `user_id`                                 | `UUID FK → users NOT NULL`     | `ON DELETE CASCADE`              |
| `key_hash`                                | `VARCHAR(255) NOT NULL UNIQUE` | Anahtarın kendisi asla saklanmaz |
| `name`                                    | `VARCHAR(100) NOT NULL`        | "Tank A sensörü"                 |
| `scopes`                                  | `TEXT[] DEFAULT ARRAY['read']` |                                  |
| `last_used` / `expires_at` / `revoked_at` | `TIMESTAMP`                    |                                  |
| `created_at`                              | `TIMESTAMP DEFAULT NOW()`      |                                  |

### `facility_verification`

Tesis doğrulama süreci (S1 adım 6-9).

| Kolon              | Tip                               | Not                                    |
| ------------------ | --------------------------------- | -------------------------------------- |
| `id`               | `UUID PK`                         |                                        |
| `facility_id`      | `UUID FK → facilities NOT NULL`   | `ON DELETE CASCADE`                    |
| `document_type`    | `VARCHAR(50) NOT NULL`            | `tax_certificate` · `operating_permit` |
| `document_url`     | `VARCHAR(500) NOT NULL`           | Max 10 MB, PDF/JPG                     |
| `status`           | `review_status DEFAULT 'pending'` |                                        |
| `reviewed_by`      | `UUID FK → users`                 | `ON DELETE SET NULL`                   |
| `reviewed_at`      | `TIMESTAMP`                       | SLA: 48 saat                           |
| `rejection_reason` | `TEXT`                            |                                        |
| `created_at`       | `TIMESTAMP DEFAULT NOW()`         |                                        |

---

## Malzeme

### `inputs` — girdi ihtiyacı (talep)

| Kolon               | Tip                             | Not                                         |
| ------------------- | ------------------------------- | ------------------------------------------- |
| `id`                | `UUID PK`                       |                                             |
| `facility_id`       | `UUID FK → facilities NOT NULL` | `ON DELETE CASCADE`                         |
| `material_class`    | `material_class`                | Nullable — uzman onayı beklerken NULL (A2)  |
| `description`       | `TEXT NOT NULL`                 | Serbest metin, embedding'in kaynağı         |
| `specs`             | `JSONB`                         | Aranan teknik özellikler                    |
| `quantity_kg`       | `NUMERIC(12,2) NOT NULL`        | **Daima kilogram** (E4)                     |
| `frequency`         | `VARCHAR(50)`                   | `daily` · `weekly` · `monthly` · `one_time` |
| `active`            | `BOOLEAN DEFAULT TRUE`          | Karşılanan ihtiyaç kapatılır                |
| `pending_review`    | `BOOLEAN DEFAULT FALSE`         | `true` iken eşleştirmeye girmez (A2)        |
| `embedding_pending` | `BOOLEAN DEFAULT FALSE`         | AI servisi düştüğünde `true` (H1)           |
| `created_at`        | `TIMESTAMP DEFAULT NOW()`       |                                             |

> `pending_review` ve `embedding_pending` alanları `outputs` tablosuyla simetriktir —
> iki taraflı embedding ürettiğimiz için (bkz. K-16) girdi tarafında da aynı tracking
> mekanizması gerekir. Eşleştirmeye girebilmek için `active = true`,
> `pending_review = false` ve `embedding_pending = false` olmalı.

### `outputs` — çıktı / yan ürün (arz)

| Kolon               | Tip                                | Not                                                               |
| ------------------- | ---------------------------------- | ----------------------------------------------------------------- |
| `id`                | `UUID PK`                          |                                                                   |
| `facility_id`       | `UUID FK → facilities NOT NULL`    | `ON DELETE CASCADE`                                               |
| `material_class`    | `material_class`                   | Nullable — `pending_review` iken NULL (A2)                        |
| `description`       | `TEXT NOT NULL`                    |                                                                   |
| `composition`       | `JSONB`                            | `{"selüloz": 60, "su": 30, "diğer": 10}` — toplam 100 olmalı (E8) |
| `quantity_kg`       | `NUMERIC(12,2) NOT NULL`           | Periyodik üretim miktarı                                          |
| `stock`             | `NUMERIC(12,2) NOT NULL DEFAULT 0` | Anlık mevcut. Kabul işleminde düşer (E7)                          |
| `frequency`         | `VARCHAR(50)`                      | `daily` · `weekly` · `monthly` · `one_time` — `inputs` ile simetrik, migration 012 |
| `availability`      | `BOOLEAN DEFAULT TRUE`             | Stok < 100 kg ise `false` (I1)                                    |
| `pending_review`    | `BOOLEAN DEFAULT FALSE`            | `true` iken eşleştirmeye girmez (A2)                              |
| `embedding_pending` | `BOOLEAN DEFAULT FALSE`            | AI servisi düştüğünde `true` (H1)                                 |
| `created_at`        | `TIMESTAMP DEFAULT NOW()`          |                                                                   |

> Bu üç bayrak birbirinden bağımsız: `pending_review` uzman bekliyor demek,
> `embedding_pending` AI servisi bekliyor demek, `availability` stok durumu demek.
> Eşleştirmeye girebilmek için üçünün de uygun olması gerekir.

### `embeddings`

Polimorfik: `record_id` + `record_type` çifti bir `input` veya `output`'a işaret eder.
Foreign key **yoktur** (polimorfik olduğu için); silme temizliği uygulama tarafında.

| Kolon           | Tip                       | Not                                                         |
| --------------- | ------------------------- | ----------------------------------------------------------- |
| `id`            | `UUID PK`                 |                                                             |
| `record_id`     | `UUID NOT NULL`           | Polimorfik — FK yok                                         |
| `record_type`   | `record_type NOT NULL`    |                                                             |
| `vector`        | `VECTOR(768) NOT NULL`    | pgvector, normalize edilmiş                                 |
| `model_version` | `VARCHAR(100) NOT NULL`   | `all-mpnet-base-v2` — model değişince yeniden hesap gerekir |
| `created_at`    | `TIMESTAMP DEFAULT NOW()` |                                                             |

Kısıt: `UNIQUE (record_id, record_type)` — bir kaydın tek vektörü olur.
Aynı metinle iki farklı kayıt açılırsa iki ayrı satır oluşur; cache aynı vektörü döner
ama saklama kaydı ayrıdır (S2).

### `material_passports` — DPP

| Kolon           | Tip                                 | Not                                             |
| --------------- | ----------------------------------- | ----------------------------------------------- |
| `id`            | `UUID PK`                           |                                                 |
| `output_id`     | `UUID FK → outputs NOT NULL UNIQUE` | 1:1 ilişki, `ON DELETE CASCADE`                 |
| `passport_data` | `JSONB NOT NULL`                    | ESPR formatı — şema [05](05-is-kurallari.md)'te |
| `dpp_compliant` | `BOOLEAN DEFAULT FALSE`             | Kompozisyon toplamı ≠ 100 ise `false` (E8)      |
| `qr_code`       | `VARCHAR(500)`                      | İmzalı public URL                               |
| `pdf_url`       | `VARCHAR(500)`                      |                                                 |
| `created_at`    | `TIMESTAMP DEFAULT NOW()`           |                                                 |

---

## Eşleştirme

### `matches`

| Kolon                       | Tip                                       | Not                                                                      |
| --------------------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| `id`                        | `UUID PK`                                 |                                                                          |
| `output_id`                 | `UUID FK → outputs NOT NULL`              | Arz tarafı, `ON DELETE CASCADE`                                          |
| `input_id`                  | `UUID FK → inputs NOT NULL`               | Talep tarafı, `ON DELETE CASCADE`                                        |
| `total_score`               | `INTEGER NOT NULL`                        | 0-100                                                                    |
| `breakdown`                 | `JSONB NOT NULL`                          | `{material, quality, environmental, logistics, economic}` her biri 0-100 |
| `status`                    | `match_status NOT NULL DEFAULT 'pending'` |                                                                          |
| `demand_qty`                | `NUMERIC(12,2)`                           | Bu eşleşmede talep edilen miktar (E7 stok düşümü)                        |
| `co2_saved`                 | `NUMERIC(12,2)`                           | kg CO2e                                                                  |
| `cost_saving`               | `NUMERIC(12,2)`                           |                                                                          |
| `cbam_impact`               | `NUMERIC(12,2)`                           | EUR                                                                      |
| `rejection_reason_category` | `VARCHAR(50)`                             | Red zorunlu alanı — karşı tarafa **bu** gösterilir (A1). `CHECK` ile altı sabit değere kısıtlı (migration 012) |
| `rejection_reason_text`     | `TEXT`                                    | Serbest metin — karşı tarafa gösterilmez                                 |
| `accepted_by_supplier_at`   | `TIMESTAMP`                               |                                                                          |
| `accepted_by_consumer_at`   | `TIMESTAMP`                               | İkisi de doluysa `completed`                                             |
| `expires_at`                | `TIMESTAMP NOT NULL`                      | `created_at + 30 gün` (A3)                                               |
| `created_at`                | `TIMESTAMP DEFAULT NOW()`                 |                                                                          |

Kısıt: `UNIQUE (output_id, input_id)` **kullanılmaz** — A3'te expired bir eşleşme için
yeniden talep açılabiliyor, eski kayıt audit izi olarak duruyor.

> `rejection_reason` PDF'te tek `TEXT` alanıydı. İkiye ayırdık çünkü senaryo A1 kategoriyi
> karşı tarafla paylaşıyor, serbest metni paylaşmıyor. Tek alanda bu ayrım yapılamaz.
> Bkz. [09-kararlar.md](09-kararlar.md) K-07.

### `human_review_queue` — HITL

| Kolon           | Tip                               | Not                                                       |
| --------------- | --------------------------------- | --------------------------------------------------------- |
| `id`            | `UUID PK`                         |                                                           |
| `output_id`     | `UUID FK → outputs`               | `ON DELETE CASCADE`. Sınıflandırma incelemesi (A2)        |
| `match_id`      | `UUID FK → matches`               | `ON DELETE CASCADE`. Eşleşme incelemesi                   |
| `confidence`    | `NUMERIC(4,3) NOT NULL`           | 0-1. Kuyruğa girme eşiği < 0.80                           |
| `reason`        | `VARCHAR(255)`                    | `low_classification_confidence` · `low_match_confidence`  |
| `ai_suggestion` | `JSONB`                           | Top-3 sınıf + güven skorları — uzman panelinde gösterilir |
| `status`        | `review_status DEFAULT 'pending'` |                                                           |
| `reviewed_by`   | `UUID FK → users`                 | `ON DELETE SET NULL`                                      |
| `reviewed_at`   | `TIMESTAMP`                       |                                                           |
| `notes`         | `TEXT`                            | Uzmanın notu → AI eğitim setine gider                     |
| `created_at`    | `TIMESTAMP DEFAULT NOW()`         |                                                           |

Kısıt: `CHECK (output_id IS NOT NULL OR match_id IS NOT NULL)` — biri dolu olmalı.

> PDF'te bu tablo sadece `match_id` tutuyordu. Ama A2 senaryosu **sınıflandırma**
> incelemesi, eşleşme incelemesi değil — o aşamada henüz match yok. İki kolon da nullable
> yapıldı. Bkz. [09-kararlar.md](09-kararlar.md) K-08.

### `reports`

| Kolon         | Tip                          | Not                                 |
| ------------- | ---------------------------- | ----------------------------------- |
| `id`          | `UUID PK`                    |                                     |
| `match_id`    | `UUID FK → matches NOT NULL` | `ON DELETE CASCADE`                 |
| `report_type` | `report_type NOT NULL`       |                                     |
| `data`        | `JSONB NOT NULL`             | Üretim anındaki **donmuş** değerler |
| `pdf_url`     | `VARCHAR(500)`               |                                     |
| `created_at`  | `TIMESTAMP DEFAULT NOW()`    |                                     |

> `data` retroaktif değişmez. Karbon faktörü sonradan güncellense bile üretilmiş rapor
> sabit kalır (AD3). Yeni rapor istenirse yeni değerlerle üretilir.

---

## Platform

### `notifications`

| Kolon        | Tip                        | Not                                               |
| ------------ | -------------------------- | ------------------------------------------------- |
| `id`         | `UUID PK`                  |                                                   |
| `user_id`    | `UUID FK → users NOT NULL` | `ON DELETE CASCADE`                               |
| `type`       | `VARCHAR(50) NOT NULL`     | Değer listesi aşağıda                             |
| `title`      | `VARCHAR(255) NOT NULL`    |                                                   |
| `body`       | `TEXT`                     |                                                   |
| `payload`    | `JSONB`                    | `{match_id, route}` — tıklanınca nereye gidilecek |
| `read_at`    | `TIMESTAMP`                | NULL ise okunmamış                                |
| `created_at` | `TIMESTAMP DEFAULT NOW()`  |                                                   |

Bildirim tipleri: `match_pending_your_approval` · `match_completed` · `match_rejected` ·
`match_expired` · `classification_approved` · `review_required` · `facility_verified` ·
`low_stock` · `sensor_offline` · `report_ready`

`type` bilerek `VARCHAR` — yeni bildirim tipi eklemek migration gerektirmesin diye.
`material_class`'tan farkı: bu değerler sadece uygulama içinde anlamlı, sorgu filtresi değil.

### `notification_prefs`

| Kolon                       | Tip                  | Not                                        |
| --------------------------- | -------------------- | ------------------------------------------ |
| `user_id`                   | `UUID PK FK → users` | `ON DELETE CASCADE`                        |
| `type`                      | `VARCHAR(50)`        | PK'nın ikinci parçası                      |
| `in_app` / `email` / `push` | `BOOLEAN`            | Varsayılanlar [06](06-senaryolar.md) A4'te |

`match_pending_your_approval`, `match_completed`, `review_required` gibi tipler için
`in_app` **zorunlu** — kapatılamaz.

### `messages` — chatbot geçmişi

| Kolon        | Tip                                       | Not                                |
| ------------ | ----------------------------------------- | ---------------------------------- |
| `id`         | `UUID PK`                                 |                                    |
| `user_id`    | `UUID FK → users NOT NULL`                | `ON DELETE CASCADE`                |
| `session_id` | `UUID NOT NULL DEFAULT gen_random_uuid()` | Chatbot oturum ayrımı (K-16)       |
| `role`       | `chat_role NOT NULL`                      |                                    |
| `content`    | `TEXT NOT NULL`                           | Kullanıcı mesajı max 2000 karakter |
| `token_cost` | `INTEGER`                                 | Maliyet takibi (S6)                |
| `created_at` | `TIMESTAMP DEFAULT NOW()`                 |                                    |

İndeks: `(user_id, session_id)` — bir kullanıcının belirli bir oturumundaki mesajları
hızlıca çekmek için. Yeni sohbet başlatıldığında frontend yeni bir `session_id` üretir;
aynı oturumdaki tüm mesajlar aynı değeri taşır.

### `sensor_data`

| Kolon         | Tip                             | Not                                         |
| ------------- | ------------------------------- | ------------------------------------------- |
| `id`          | `UUID PK`                       |                                             |
| `facility_id` | `UUID FK → facilities NOT NULL` | `ON DELETE CASCADE`                         |
| `output_id`   | `UUID FK → outputs`             | Hangi çıktının stoğunu güncelliyor (I1)     |
| `sensor_type` | `VARCHAR(50) NOT NULL`          |                                             |
| `value`       | `NUMERIC(12,4) NOT NULL`        |                                             |
| `unit`        | `VARCHAR(20) NOT NULL`          |                                             |
| `timestamp`   | `TIMESTAMP NOT NULL`            | Sensörün ürettiği zaman, kayıt zamanı değil |

### `audit_log`

| Kolon              | Tip                       | Not                                                                                                                                                                                                                                          |
| ------------------ | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | `UUID PK`                 |                                                                                                                                                                                                                                              |
| `actor_id`         | `UUID`                    | **FK yok, bilinçli olarak** — bir kullanıcı kendi tesisini silerse (cascade ile kendi kaydı da gider) aktör artık `users` tablosunda yoktur; audit yazımı bunu FK ihlali yapmadan kaydedebilmeli. Bkz. [09-kararlar.md](09-kararlar.md) K-14 |
| `action`           | `VARCHAR(50) NOT NULL`    | `create` · `update` · `delete` · `accept` · `reject` · `verify` · `activate`                                                                                                                                                                 |
| `entity`           | `VARCHAR(50) NOT NULL`    | `output` · `match` · `facility` · `weights_config` ...                                                                                                                                                                                       |
| `entity_id`        | `UUID NOT NULL`           |                                                                                                                                                                                                                                              |
| `before` / `after` | `JSONB`                   |                                                                                                                                                                                                                                              |
| `ip_address`       | `INET`                    |                                                                                                                                                                                                                                              |
| `created_at`       | `TIMESTAMP DEFAULT NOW()` |                                                                                                                                                                                                                                              |

---

## Yapılandırma

### `system_config`

Deploy gerektirmeden değişebilen eşikler.

| Kolon         | Tip                       |
| ------------- | ------------------------- |
| `key`         | `VARCHAR(100) PK`         |
| `value`       | `JSONB NOT NULL`          |
| `description` | `TEXT`                    |
| `updated_at`  | `TIMESTAMP DEFAULT NOW()` |
| `updated_by`  | `UUID FK → users`         |

Başlangıç değerleri:

| key                    | value  | Anlamı                                 |
| ---------------------- | ------ | -------------------------------------- |
| `match.threshold`      | `0.60` | Cosine benzerlik alt eşiği             |
| `match.top_k`          | `20`   | Skorlama öncesi aday sayısı            |
| `match.top_n`          | `10`   | Kullanıcıya dönen eşleşme sayısı       |
| `match.hitl_threshold` | `0.80` | Uzman onay tetik eşiği                 |
| `match.expiry_days`    | `30`   |                                        |
| `chat.daily_limit`     | `50`   | Kullanıcı başına günlük chatbot mesajı |

### `weights_config` — AHP ağırlıkları

| Kolon                                                               | Tip                       | Not                                |
| ------------------------------------------------------------------- | ------------------------- | ---------------------------------- |
| `id`                                                                | `UUID PK`                 |                                    |
| `version`                                                           | `INTEGER NOT NULL`        |                                    |
| `material` / `quality` / `environmental` / `logistics` / `economic` | `NUMERIC(4,3) NOT NULL`   | Her biri `CHECK (BETWEEN 0 AND 1)` |
| `active`                                                            | `BOOLEAN DEFAULT FALSE`   |                                    |
| `created_by`                                                        | `UUID FK → users`         |                                    |
| `created_at`                                                        | `TIMESTAMP DEFAULT NOW()` |                                    |

İki kritik kısıt:

```sql
CHECK (ROUND(material + quality + environmental + logistics + economic, 3) = 1.000)
CREATE UNIQUE INDEX idx_weights_active ON weights_config(active) WHERE active = TRUE;
```

Kısmi unique indeks sayesinde aynı anda **yalnızca bir** versiyon aktif olabilir; v3
aktifleştiğinde v2 otomatik düşer (AD2).

Başlangıç: `v1 = (0.30, 0.20, 0.20, 0.15, 0.15)`, aktif.

### `carbon_factors` — CBAM

| Kolon            | Tip                       | Not                                      |
| ---------------- | ------------------------- | ---------------------------------------- |
| `id`             | `UUID PK`                 |                                          |
| `material_class` | `material_class NOT NULL` |                                          |
| `factor_type`    | `VARCHAR(20) NOT NULL`    | `virgin` · `secondary` · `transport`     |
| `co2_per_kg`     | `NUMERIC(10,4) NOT NULL`  | kg CO2e / kg malzeme                     |
| `source`         | `VARCHAR(255) NOT NULL`   | `Ecoinvent v3.10` — denetim için zorunlu |
| `valid_from`     | `DATE NOT NULL`           |                                          |
| `valid_to`       | `DATE`                    | NULL = hâlâ geçerli                      |
| `created_at`     | `TIMESTAMP DEFAULT NOW()` |                                          |

Aktif faktör sorgusu (AD3):

```sql
WHERE valid_from <= NOW() AND (valid_to IS NULL OR valid_to > NOW())
```

---

## İndeksler

```sql
-- Vektör benzerlik: HNSW, cosine mesafesi
CREATE INDEX idx_embeddings_hnsw ON embeddings
    USING hnsw (vector vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
CREATE UNIQUE INDEX idx_embeddings_record ON embeddings(record_id, record_type);

-- Coğrafi mesafe
CREATE INDEX idx_facilities_location ON facilities USING GIST (location);
CREATE INDEX idx_osbs_region        ON osbs       USING GIST (region);

-- Sık kullanılan filtreler
CREATE INDEX idx_outputs_material_class ON outputs(material_class);
CREATE INDEX idx_inputs_material_class  ON inputs(material_class);
CREATE INDEX idx_outputs_facility       ON outputs(facility_id);
CREATE INDEX idx_inputs_facility        ON inputs(facility_id);
CREATE INDEX idx_matches_output         ON matches(output_id);
CREATE INDEX idx_matches_input          ON matches(input_id);
CREATE INDEX idx_matches_status         ON matches(status, expires_at);

-- Kısmi indeksler: sadece ilgilenilen satırlar
CREATE INDEX idx_notif_user_unread ON notifications(user_id)      WHERE read_at IS NULL;
CREATE INDEX idx_review_pending    ON human_review_queue(status, created_at) WHERE status = 'pending';
CREATE INDEX idx_api_keys_hash     ON api_keys(key_hash)          WHERE revoked_at IS NULL;
CREATE INDEX idx_carbon_active     ON carbon_factors(material_class, factor_type) WHERE valid_to IS NULL;
CREATE INDEX idx_audit_entity      ON audit_log(entity, entity_id, created_at DESC);
CREATE INDEX idx_sensor_facility   ON sensor_data(facility_id, timestamp DESC);
CREATE INDEX idx_messages_user_session ON messages(user_id, session_id);
```

HNSW parametreleri (`m=16`, `ef_construction=64`) 105 malzemelik veri setine göre
seçildi. Veri büyüdükçe `ef_search` sorgu zamanında ayarlanmalı.

---

## Migration sırası

Sırayla uygulanır. Dosyalar `backend/prisma/migrations/` altında.

| #   | Dosya                        | İçerik                                                                                                |
| --- | ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| 001 | `001_extensions.sql`         | pgcrypto, vector, postgis                                                                             |
| 002 | `002_enums.sql`              | 7 enum tipi                                                                                           |
| 003 | `003_identity.sql`           | `osbs`, `facilities`, `users`, `api_keys`, `facility_verification`                                    |
| 004 | `004_materials.sql`          | `inputs`, `outputs`, `embeddings`, `material_passports`                                               |
| 005 | `005_matching.sql`           | `matches`, `human_review_queue`, `reports`                                                            |
| 006 | `006_platform.sql`           | `notifications`, `notification_prefs`, `messages`, `sensor_data`, `audit_log`                         |
| 007 | `007_config.sql`             | `system_config`, `weights_config`, `carbon_factors`                                                   |
| 008 | `008_indexes.sql`            | HNSW, GIST, kısmi indeksler                                                                           |
| 009 | `009_seed.sql`               | Varsayılan ağırlıklar, karbon faktörleri, system_config                                               |
| 010 | `010_audit_actor_fk_fix.sql` | `audit_log.actor_id` FK'sını kaldırır (K-14)                                                          |
| 011 | `011_k10_schema_fixes.sql`   | `inputs`'e `pending_review` + `embedding_pending`, `messages`'a `session_id` + composite index (K-16) |
| 012 | `012_pre_phase1_fixes.sql`   | `outputs`'a `frequency`, `matches.rejection_reason_category` için `CHECK` (K-17)                      |

Uygulama (pooler değil, **doğrudan bağlantı**):

```bash
psql "$DIRECT_URL" -f backend/prisma/migrations/001_extensions.sql
```

> `ALTER TYPE ... ADD VALUE` transaction bloğu içinde çalışmaz. Enum'a yeni değer eklerken
> (AD5 — `rubber` gibi) kendi migration dosyasını aç.

---

## Prisma eşlemesi

Prisma `vector` ve `geography` tiplerini bilmiyor. `Unsupported(...)` ile tanımlanır —
bu kolonlar Prisma sorgularında **seçilemez**, sadece raw SQL ile erişilir.

```prisma
enum UserRole {
  USER           @map("user")
  FACILITY_ADMIN @map("facility_admin")
  EXPERT         @map("expert")
  OSB_MANAGER    @map("osb_manager")
  ADMIN          @map("admin")

  @@map("user_role")
}

model Facility {
  id       String                                   @id @default(uuid()) @db.Uuid
  name     String                                   @db.VarChar(255)
  taxId    String                                   @unique @map("tax_id") @db.VarChar(20)
  location Unsupported("geography(Point, 4326)")?
  verified Boolean                                  @default(false)

  @@map("facilities")
}

model Embedding {
  id           String                        @id @default(uuid()) @db.Uuid
  recordId     String                        @map("record_id") @db.Uuid
  recordType   RecordType                    @map("record_type")
  vector       Unsupported("vector(768)")
  modelVersion String                        @map("model_version") @db.VarChar(100)

  @@unique([recordId, recordType])
  @@map("embeddings")
}
```

### Vektör ve coğrafya sorguları

Aday bulma sorgusu — self-match filtresi (E1), eşik (0.60) ve doğrulama kontrolü dahil:

```ts
const candidates = await this.prisma.$queryRaw<Candidate[]>`
  SELECT i.id,
         i.facility_id,
         i.quantity_kg,
         1 - (e_out.vector <=> e_in.vector) AS similarity,
         ST_Distance(f_out.location, f_in.location) / 1000 AS distance_km
    FROM inputs i
    JOIN embeddings e_in
      ON e_in.record_id = i.id AND e_in.record_type = 'input'
    JOIN facilities f_in  ON f_in.id  = i.facility_id
    JOIN outputs   o      ON o.id     = ${outputId}::uuid
    JOIN facilities f_out ON f_out.id = o.facility_id
    JOIN embeddings e_out
      ON e_out.record_id = o.id AND e_out.record_type = 'output'
   WHERE i.facility_id <> o.facility_id      -- E1: self-match yok
     AND i.active = TRUE
     AND f_in.verified = TRUE
     AND 1 - (e_out.vector <=> e_in.vector) >= ${threshold}
   ORDER BY similarity DESC
   LIMIT ${topK}
`;
```

Vektör yazma — parametre olarak string literal gönderilir:

```ts
await this.prisma.$executeRaw`
  INSERT INTO embeddings (record_id, record_type, vector, model_version)
  VALUES (${recordId}::uuid, ${recordType}::record_type,
          ${`[${vector.join(",")}]`}::vector, ${model})
  ON CONFLICT (record_id, record_type)
  DO UPDATE SET vector = EXCLUDED.vector, model_version = EXCLUDED.model_version
`;
```

> `$queryRaw` **tagged template** olarak kullanılır — Prisma parametreleri bağlar.
> `$queryRawUnsafe` ile string birleştirme yapılmaz. `<=>` pgvector'ün cosine mesafe
> operatörüdür; benzerlik `1 - mesafe`'dir.

## Bilinen sadeleştirmeler

Bunlar bilinçli borç, bug değil:

- `embeddings` polimorfik FK kullanıyor — referans bütünlüğü DB'de zorlanmıyor.
  `DELETE /v1/materials/outputs|inputs/:id` embedding'i uygulama tarafında temizliyor,
  ama hesap/tesis silme cascade'i (`ON DELETE CASCADE`) temizlemiyor — yetim satır
  kalabilir, zararsız ama birikir (bkz. K-25).
- Dosya depolama (belge, PDF, QR) MVP'de yerel disk; S3/MinIO'ya geçiş Faz 3.
- `notification_prefs` Faz 2'de devreye giriyor; o zamana kadar tüm bildirimler
  varsayılan davranışla gider.

---

## 8. AI Veri Yapıları, Vektör Modeli ve Eğitim Veri Seti Şeması

Şartname Madde 10.3 (Başlık 5) gereğince, yapay zekâ mikroservisinin kullandığı 768 boyutlu vektör yapıları, PostgreSQL `vector(768)` kolon özellikleri ve 592 satırlık eğitim veri seti (`veri.csv`) şeması aşağıda detaylandırılmıştır.

### 8.1. `embeddings` Tablosu Şeması (PostgreSQL + pgvector)

Backend veritabanında (`eco-match-db`) yer alan ve anlamsal arama için kullanılan tablo tanımı (`004_materials.sql` ve `008_indexes.sql`):

```sql
CREATE TABLE IF NOT EXISTS embeddings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id      UUID NOT NULL,
  record_type    record_type NOT NULL,          -- ENUM ('input', 'output')
  vector         vector(768) NOT NULL,          -- 768 boyutlu SBERT embedding
  model_version  VARCHAR(50) NOT NULL,          -- örn: 'ai-service-fine-tuned-mpnet-v1'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_embeddings_record UNIQUE (record_id, record_type)
);

-- HNSW (Hierarchical Navigable Small World) Vektör İndeksi
CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw 
  ON embeddings USING hnsw (vector vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

**Alan Açıklamaları:**
- `record_id`: İlgili `inputs` veya `outputs` tablosundaki UUID birincil anahtarı.
- `record_type`: Polimorfik kayıt tipi (`input` veya `output`). Bir malzeme için yalnızca bir aktif embedding kaydı olabilir (`uq_embeddings_record` kısıtı).
- `vector`: 768 boyutlu IEEE-754 kayan noktalı sayı dizisi ($L_2$ normalize edilmiş, kosinüs mesafesi $<=>$).
- `model_version`: Vektörü üreten AI modelinin kimliği (sürüm güncellemelerinde geriye dönük uyumluluk ve yeniden vektörleme tespiti için).
- `idx_embeddings_hnsw`: $O(\log N)$ arama karmaşıklığı sunan HNSW indeksi. Kosinüs benzerliği hesaplamasında `vector_cosine_ops` kullanılır.

---

### 8.2. AI Mikroservisi Dahili Vektör Tablosu (`category_examples`)

AI mikroservisinin kendi izole pgvector veritabanında (`ecomatch_pgvector:5433`) çalışan ve prototip tabanlı sınıflandırma için kullanılan şema:

```sql
CREATE TABLE IF NOT EXISTS category_examples (
  id        SERIAL PRIMARY KEY,
  category  VARCHAR(50) NOT NULL,   -- METAL, PLASTIK, ORGANIK, vb.
  example   TEXT NOT NULL,          -- Örnek malzeme tanımı
  source    VARCHAR(50) NOT NULL,   -- 'csv_import' veya 'human_review'
  active    BOOLEAN DEFAULT TRUE,
  CONSTRAINT uq_category_example UNIQUE (category, example)
);

CREATE INDEX IF NOT EXISTS idx_cat_examples_active ON category_examples (active);
```

---

### 8.3. `veri.csv` Eğitim ve Değerlendirme Veri Seti Şeması (592 Satır)

`AI Microservice/veri.csv` dosyası 2 ana bölümden ve toplam 592 veri satırından oluşur
(ayrıca 10 alt-bölüm başlık satırı vardır; dosyanın ham satır sayısı bunlarla birlikte 602'dir):

#### Bölüm 1: Sınıflandırma Örnekleri (140 Satır, Satır 1-141)
Atık sınıflandırma modelinin prototiplerini ve doğruluk testini oluşturan şema:

| Kolon Adı | Tip | Örnek Değer | Açıklama |
|---|---|---|---|
| `id` | VARCHAR(10) | `KG001`, `KG009`, `KG137` | Benzersiz kategori örnek kodu. |
| `kategori` | VARCHAR(20) | `METAL`, `PLASTİK`, `ORGANİK` | 7 temel endüstriyel malzeme kategorisi. |
| `tanim` | TEXT | *"çelik talaşı"*, *"DKP sac fire"* | Sahada karşılaşılan atık veya yan ürün serbest metni. |
| `tip` | VARCHAR(20) | `kisa`, `kisaltma`, `karma`, `yazim_hatali`, `genel` | Girdinin dilbilgisel ve sektörel zorluk seviyesi sınıfı. |

#### Bölüm 2: Eşleştirme ve Simbiyoz Çiftleri (452 Satır, Satır 142-602)
SBERT modelinin `CosineSimilarityLoss` ile eğitilmesini ve F1 skorunun ölçülmesini sağlayan ikili veri şeması:

| Kolon Adı | Tip | Örnek Değer | Açıklama |
|---|---|---|---|
| `id` | VARCHAR(10) | `IN001`, `IN145` | Benzersiz çift kodu. |
| `kategori` | VARCHAR(20) | `METAL`, `PLASTİK`, `KİMYASAL` | Malzemelerin ait olduğu endüstriyel sektör grubu. |
| `cikti_tanim` | TEXT | *"304 paslanmaz çelik CNC talaşı"* | Atık veya yan ürün serbest metin açıklaması. |
| `girdi_tanim` | TEXT | *"Bakır rafinasyon tesisi granül girdisi"* | Hammadde veya ikame girdi arayan tesisin talep metni. |
| `etiket` | INTEGER (0/1) | `1` veya `0` | **1**: Endüstriyel simbiyoz uyumlu (Pozitif çift).<br/>**0**: Metalurjik/kimyasal uyumsuz (Hard Negative). |
| `neden` | TEXT | *"Farklı metal ailesi: ergitme sıcaklıkları farklı..."* | Negatif veya pozitif kararın teknik/mühendislik gerekçesi. |

