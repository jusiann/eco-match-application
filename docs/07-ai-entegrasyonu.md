# 07 · AI Entegrasyonu

Bu doküman **iki ekip arasındaki sınırdır**. Backend ve AI servisi ayrı repolarda, ayrı
kişiler tarafından yazılıyor. Buradaki sözleşme değişmeden ne backend AI'ın davranışını
varsayabilir, ne AI backend'in.

Aşağıdaki "Sözleşme" bölümü bu sınırın tek gerçek kaynağıdır.

## Temel kural: AI servisi stateless

AI servisi **hiçbir şey saklamaz**. Metin alır, vektör veya sınıflandırma döndürür. Bitti.

| Sorumluluk | Kimde |
|---|---|
| Metni vektöre çevirmek | AI servisi |
| Metni sınıflandırmak | AI servisi |
| Türkçe endüstri sözlüğüyle zenginleştirmek (`enrich_text`) | AI servisi |
| Vektörü saklamak | **Backend** |
| `record_id` ile eşleştirmek | **Backend** |
| Benzerlik araması yapmak (adayları bulmak) | **Backend** (pgvector) |
| Bulunan adayları BM25 ile yeniden sıralamak (`/rerank`) | AI servisi (stateless — corpus istekle gelir) |
| Eşik uygulamak (0.60) | **Backend** |
| HITL kuyruğuna atmak | **Backend** |

### Neden böyle

Erken versiyonda AI servisinin kendi in-memory vektör deposu vardı ve `record_id`'yi
`integer` tutuyordu. Backend ise `UUID` gönderiyordu. Sonuç: ya hata fırlıyordu ya da
**sessizce bozuk indeks üretiliyordu** — ki ikincisi çok daha kötü.

Saklama sorumluluğu tamamen backend'e verilince tip uyuşmazlığı yapısal olarak imkânsız
hâle geldi. Yan faydaları: AI servisi yatay ölçeklenebilir, çöktüğünde veri kaybolmaz,
yeniden başlatmak bedava.

> `record_id` ve `record_type` istekte hâlâ gönderiliyor — ama **sadece log/trace için**.
> AI servisi onlarla iş yapmaz, onlara göre dallanmaz, onları saklamaz.

## Sözleşme

Base URL: `AI_SERVICE_URL` ortam değişkeni. Servisler arası çağrı, internet'e açık değil.

### `POST /embed`

**İstek**

```json
{
  "text": "Malzeme: organic — Tekstil boyahanesi çıkışı arıtma çamuru. Bileşim: selüloz %60, su %30",
  "record_id": "550e8400-e29b-41d4-a716-446655440000",
  "record_type": "output"
}
```

| Alan | Tip | Zorunlu | Not |
|---|---|---|---|
| `text` | string | Evet | 1-5000 karakter |
| `record_id` | UUID | Hayır | Sadece log/trace |
| `record_type` | `input`\|`output` | Hayır | Sadece log/trace |

**Cevap — 200**

```json
{
  "vector": [0.023, -0.145, "... 768 eleman"],
  "model": "all-mpnet-base-v2",
  "dim": 768,
  "normalized": true
}
```

`normalized: true` **kritiktir**: backend vektörü DB'ye olduğu gibi yazar, kendisi
normalize etmez. `false` dönerse backend bunu hata sayar — pgvector cosine mesafesi
normalize edilmemiş vektörlerde yanlış sonuç verir.

`vector` uzunluğu tam **768** olmalı. Az veya çok gelirse backend reddeder ve
`embedding_pending` bırakır.

### `POST /classify`

**İstek**

```json
{ "text": "boya artığı, karışık" }
```

**Cevap — 200**

```json
{
  "material_class": "chemical",
  "confidence": 0.62,
  "top3": [["chemical", 0.62], ["organic", 0.21], ["other", 0.17]],
  "requires_human_review": true
}
```

`requires_human_review` = `confidence < 0.80`. AI servisi bu bayrağı kendisi hesaplar
ama **backend de eşiği kendi kontrol eder** — tek kaynağa güvenmiyoruz, eşik
`system_config` tablosunda ve orası otoritedir.

`material_class` değerleri **lowercase**, tam olarak şu 8 tanesi:
`metal` · `plastic` · `organic` · `chemical` · `textile` · `glass` · `paper` · `other`

Bilinmeyen bir değer gelirse backend bunu hata sayar ve kaydı HITL kuyruğuna alır.

### `POST /rerank`

Backend'in gerçek eşleştirme akışı (`matches.service.ts`) pgvector ile bulduğu topK
adayı SBERT benzerlikleriyle birlikte gönderir; AI servisi bunları BM25 (kelime) ile
füzyonlayıp yeniden sıralı döner. **Tamamen stateless** — AI hiçbir şey saklamaz/aramaz,
`candidates` isteğin içinde gelir, DB'ye dokunulmaz (K-06 ile aynı ilke).

**İstek**

```json
{
  "query_text": "Malzeme: METAL. 304 paslanmaz çelik talaşı. Miktar: 500 kg",
  "candidates": [
    { "record_id": "550e8400-...", "text": "Malzeme: METAL. Ferrous hurda. Miktar: 1000 kg", "sbert_similarity": 0.72 }
  ]
}
```

`text` alanı, o adayın **embedding'e giren aynı metni** olmalı (`buildInputText` /
`buildOutputText` çıktısı) — SBERT ve BM25 farklı metinleri tokenize/vektörlerse füzyon
anlamsız olur. `candidates` en fazla 200 eleman.

**Cevap — 200**

```json
{
  "results": [
    { "record_id": "550e8400-...", "hybrid_score": 0.6980, "bm25_score": 0.31, "sbert_score": 0.72 }
  ]
}
```

`results`, `candidates` ile **birebir aynı küme** — AI hiçbir adayı elemez/eklemez, sadece
`hybrid_score`'a göre yeniden sıralar. Backend bu skoru `materialScore()`'a girdi olarak
kullanır (önceden `similarity` idi). AI servisi ulaşılamazsa (H1 tablosu) backend
`hybrid_score = sbert_score`, `bm25_score = 0` ile devam eder — davranış, bu endpoint hiç
var olmasaymış gibi olur, eşleştirme AI'a bağımlı kilitlenmez.

Bu endpoint AI'ın kendi `/search`'ünden farklı: `/search` AI'ın kendi (self-contained,
sadece AI'ın kendi demo/test scriptlerinin kullandığı) pgvector korpusunda arar; `/rerank`
gerçek backend verisiyle çalışır ve **gerçek kullanıcı eşleşme sonuçlarını etkiler**.

### `GET /health`

```json
{
  "status": "ok",
  "model_name": "all-mpnet-base-v2",
  "model_version": "1.0.0",
  "dim": 768
}
```

Backend `/health/ready` içinde bunu çağırır ve `model_version` değişimini loglar —
model değişirse mevcut embedding'lerin yeniden hesaplanması gerekir.

## Backend tarafındaki akış

### Embedding metni nasıl kuruluyor

Vektöre giren metni **backend** hazırlar. AI servisi ham `description`'ı değil, bu
yapılandırılmış metni alır:

```ts
buildEmbeddingText(output: Output): string {
  return [
    `Malzeme: ${output.materialClass}`,
    output.description,
    output.composition
      ? `Bileşim: ${Object.entries(output.composition)
          .map(([k, v]) => `${k} %${v}`).join(', ')}`
      : null,
    `Miktar: ${output.quantityKg} kg`,
  ].filter(Boolean).join('. ');
}
```

AI servisi bunun üstüne kendi `enrich_text()` sözlüğünü uygular (Türkçe endüstri
terimleri, İngilizce karşılıkları). O sözlük AI ekibinin sorumluluğunda ve versiyonlanıyor —
`model_version` değiştiğinde embedding'ler eskimiş sayılır.

### Yazma akışı

```ts
async createEmbedding(recordId: string, recordType: 'input' | 'output', text: string) {
  const { vector, normalized, dim } = await this.aiClient.embed({
    text, record_id: recordId, record_type: recordType,
  });

  if (!normalized || dim !== 768 || vector.length !== 768) {
    throw new AiContractViolationError({ normalized, dim, length: vector.length });
  }

  await this.prisma.$executeRaw`
    INSERT INTO embeddings (record_id, record_type, vector, model_version)
    VALUES (${recordId}::uuid, ${recordType}::record_type,
            ${`[${vector.join(',')}]`}::vector, ${model})
    ON CONFLICT (record_id, record_type)
    DO UPDATE SET vector = EXCLUDED.vector, model_version = EXCLUDED.model_version
  `;
}
```

`ON CONFLICT` önemli: çıktı güncellendiğinde embedding yeniden hesaplanır, satır çoğalmaz.

## Dayanıklılık — AI servisi düştüğünde

Bu bölüm senaryo **H1**'in implementasyon detayıdır. Kullanıcı akışı asla AI servisine
bağımlı olarak kilitlenmez.

### Retry

3 deneme, exponential backoff: **500 ms → 1 s → 2 s**. Her denemenin timeout'u 3 saniye.

### Circuit breaker

| Durum | Koşul | Davranış |
|---|---|---|
| Kapalı | Normal | İstekler geçer |
| **Açık** | Son 60 sn'de %50+ hata (min 20 istek) | AI hiç çağrılmaz, direkt fallback |
| Half-open | Açıldıktan 30 sn sonra | Tek deneme; başarılıysa kapanır, değilse tekrar açılır |

### Endpoint bazlı fallback

| Çağrı | AI erişilemezse |
|---|---|
| `/embed` (çıktı kaydı) | Çıktı **yine kaydedilir**, `embedding_pending = true`, Redis `pending_embeddings` kuyruğuna iş eklenir. Response 201 + `embeddingPending: true` |
| `/classify` (canlı öneri) | `503 AI_SERVICE_UNAVAILABLE` → istemci sınıf dropdown'ını açar, kullanıcı elle seçer |
| Eşleştirme — aday **bulma** (pgvector) | Etkilenmez — zaten embed edilmiş kayıtlarla arama yapılır |
| Eşleştirme — aday **sıralama** (`/rerank`) | Sessizce SBERT-only sıralamaya döner (`hybrid_score = sbert_score`) — 503/hata kullanıcıya asla yansımaz, `/rerank` bu endpoint için var olmasaymış gibi davranılır |

### Arka plan işçisi

`pending_embeddings` kuyruğunu tüketen worker, AI servisi geri geldiğinde bekleyen
kayıtları işler ve `embedding_pending = false` yapar. Kullanıcıya ayrıca bildirim gitmez;
çıktı eşleştirmeye sessizce açılır.

### Kullanıcıya ne diyoruz

> "AI özelliği geçici olarak sınırlı. Kaydınız alındı, birazdan tam işlenecek."

Panik yaratmayan dil. "Hata", "başarısız", "sunucu" gibi kelimeler kullanılmaz —
kullanıcının işi aslında yapıldı.

## Cache

AI ekibi `/embed` sonuçlarını `SHA256(text)` anahtarıyla Redis'te 24 saat cache'liyor.
Backend için anlamı: **aynı metin aynı vektörü döner**, ama her kaydın kendi
`embeddings` satırı vardır (S2 kabul kriteri). Cache hit p95 hedefi < 50 ms.

## Performans hedefleri

| Metrik | Hedef | Neden |
|---|---|---|
| `/classify` p95 | < 500 ms | Kullanıcı form yazarken canlı öneri gösteriliyor |
| `/embed` p95 | < 300 ms | Cache hit'te < 50 ms |
| `/embed` yük | 100 eşzamanlı istek, p95 < 500 ms | |
| `/rerank` p95 | < 300 ms | Aday listesi sayfası (`GET /v1/matches/find/:outputId`) her açılışta çağırır, topK≤20 küçük korpus |
| Backend timeout | 3 s | Bunun üstü fallback |

## AI ekibine geri besleme

Backend haftalık batch ile iki dosya üretir:

| Dosya | İçerik | Kaynak |
|---|---|---|
| `training/feedback/rejections.jsonl` | Reddedilen eşleşmeler + kategori | A1 |
| `training/human_reviewed.jsonl` | `{text, ai_prediction, ai_confidence, human_label, notes}` | A2, AD1 |

İkincisi özellikle değerli: uzmanın düzelttiği her sınıflandırma, modelin bir sonraki
sürümü için etiketli veri demek.

## Sözleşme değişikliği nasıl yapılır

1. Bu dokümanın "Sözleşme" bölümü güncellenir
2. İki ekip de PR'ı onaylar
3. Sonra kod yazılır

Sırayı bozmak, iki tarafın birbirini beklediği ve ikisinin de yanlış varsayımla ilerlediği
bir hafta demek. Sözlü anlaşma yapılmaz.

## Kapsam dışı — bunlar AI ekibinin işi

Backend bu repoda şunları **implemente etmez**, sadece çağırır:

- FastAPI servisi, SBERT model yükleme
- `enrich_text()` Türkçe endüstri sözlüğü
- Sınıflandırıcı ve softmax güven hesabı
- BM25 hibrit füzyon mantığı (`hybrid_search.py`, alpha kalibrasyonu) — backend sadece `/rerank`'ı çağırır, füzyon formülüne dokunmaz
- Embedding cache (Redis)
- AHP kalibrasyon script'i (`scripts/ahp_calibration.py`) — çıktısı admin panelden girilir
- Doğruluk testleri, golden dataset
