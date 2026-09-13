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
| Benzerlik araması yapmak | **Backend** (pgvector) |
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

> **K-34 (2026-09-13).** AI servisinin gerçek şekli, bu bölümün önceki halinin varsaydığından
> iki noktada farklı çıktı: kategori isimleri ve `/embed`'in döndürdüğü alanlar. Teslime kalan
> süre kısaydı; AI servisini (ayrı repo/ekip, ölçüm raporları buna bağlı) değiştirmek yerine
> backend'de ince bir adaptör katmanı (`ai-client.service.ts`) yazıldı. Aşağıdaki sözleşme artık
> **AI servisinin gerçekte döndürdüğü şekli** + **backend'in bunu nasıl uyarladığını**
> gösteriyor — ikisi birden güncel/doğru kaynak. Detay ve alternatiflerin karşılaştırması:
> docs/09 K-34.

### `POST /embed`

**İstek** — backend sadece `text` gönderir (AI servisi `record_id`/`record_type` almaz,
tutmaz; eşleştirme tamamen backend tarafında olduğu için buna ihtiyacı yok, bkz. yukarıdaki
"Temel kural"):

```json
{ "text": "Malzeme: organic — Tekstil boyahanesi çıkışı arıtma çamuru. Bileşim: selüloz %60, su %30" }
```

| Alan | Tip | Zorunlu | Not |
|---|---|---|---|
| `text` | string | Evet | 1-5000 karakter |

**AI servisinin gerçek cevabı — 200**

```json
{
  "vector": [0.023, -0.145, "... 768 eleman"],
  "dim": 768
}
```

AI servisi `model` ve `normalized` alanlarını **döndürmez** (`AI Microservice/app/schemas.py`
`EmbedResponse`). Backend'in adaptörü (`ai-client.service.ts`) bunları kendisi tamamlar:
- `normalized: true` — AI'ın `embedder.py` içindeki `encode(..., normalize_embeddings=True)`
  çağrısı zaten her zaman L2-normalize vektör ürettiği için bu, bilinen-doğru bir sabit.
  AI tarafı gerçekten normalize etmeyi bırakırsa bu varsayım da yanlış olur — sözleşme
  değişikliği gerektirir (aşağıdaki prosedür).
- `model: "ai-service-fine-tuned-mpnet-v1"` — AI servisinde karşılığı yok, backend'in kendi
  sabit etiketi (`embeddings.model_version` kolonuna yazılır). AI ekibi modeli değiştirirse
  bu sabit elle güncellenmeli.

Backend'e ulaşan nihai obje (`EmbedResult`) böylece hâlâ `{vector, model, dim, normalized}`
şeklinde — `EmbeddingsService`'in aşağıdaki `!normalized || dim !== 768` kontratı hiç
değişmedi, sadece `normalized`'in kaynağı AI değil backend'in adaptörü.

`vector` uzunluğu tam **768** olmalı. Az veya çok gelirse backend reddeder ve
`embedding_pending` bırakır. AI servisine hiç ulaşılamazsa adaptör throw etmez, `{vector: [],
model: '', dim: 0, normalized: false}` sentinel'i döner — bu da aynı `!normalized` kontrolüne
takılıp aynı fallback'i (embedding_pending=true) tetikler.

### `POST /classify`

**İstek**

```json
{ "text": "boya artığı, karışık" }
```

**AI servisinin gerçek cevabı — 200**

```json
{
  "category": "KIMYASAL",
  "confidence": 0.62,
  "all_scores": {"KIMYASAL": 0.62, "ORGANIK": 0.21, "PLASTIK": 0.17}
}
```

AI servisi **`material_class` değil `category`** döner, **Türkçe ve büyük harf**, tam olarak
şu 7 tanesi (`AI Microservice/app/classifier.py` `CATEGORY_EXAMPLES`):
`METAL` · `PLASTIK` · `ORGANIK` · `KIMYASAL` · `TEKSTIL` · `CAM` · `KAGIT`

"other" karşılığı **AI tarafında yok** — sınıflandırıcı prototip-tabanlı, gelen metni her
zaman bu 7 kategoriden en yakınına atar, "bilmiyorum" diye bir çıkışı yok. `top3` ve
`requires_human_review` alanları da AI'ın cevabında **yok** — backend'in adaptörü:

- `top3`'ü `all_scores`'u kendisi sıralayıp üretir.
- Kategori adını `AI_CATEGORY_TO_MATERIAL_CLASS` tablosuyla İngilizce/küçük harfe çevirir
  (`metal`·`plastic`·`organic`·`chemical`·`textile`·`glass`·`paper` — 7 tanesi, `other` bu
  tabloda yok çünkü AI'dan hiç gelmiyor).
- `requiresHumanReview`'i **kendisi** hesaplar: `confidence < system_config['match.hitl_threshold']`
  (varsayılan 0.80). Yani "other" olmaması hiçbir şeyi kırmıyor — düşük güven durumunu backend
  zaten kategoriden bağımsız, sadece `confidence` sayısına bakarak yakalıyor.

Bilinmeyen bir kategori adı gelirse (tablo dışı) adaptör `.toLowerCase()` ile geçiştirir —
bu sadece savunma amaçlı, normal akışta hiç tetiklenmemesi beklenir (bkz. `AI
Microservice/tests/test_backend_contract.py`, bu 7 kategoriyi statik olarak doğrular).

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
| Eşleştirme | Etkilenmez — zaten embed edilmiş kayıtlarla arama yapılır |

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
- Embedding cache (Redis)
- AHP kalibrasyon script'i (`scripts/ahp_calibration.py`) — çıktısı admin panelden girilir
- Doğruluk testleri, golden dataset
