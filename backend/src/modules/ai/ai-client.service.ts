import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

export const MATERIAL_CLASSES = ['metal', 'plastic', 'organic', 'chemical', 'textile', 'glass', 'paper', 'other'];

export interface ClassifyResult {
  materialClass: string;
  confidence: number;
  top3: Array<[string, number]>;
}

export interface EmbedResult {
  vector: number[];
  model: string;
  dim: number;
  normalized: boolean;
}

interface AiClassifyResponse {
  category: string;
  confidence: number;
  all_scores: Record<string, number>;
}

interface AiEmbedResponse {
  vector: number[];
  dim: number;
}

export interface RerankCandidate {
  recordId: string;
  text: string;
  sbertSimilarity: number;
}

export interface RerankResultItem {
  recordId: string;
  hybridScore: number;
  bm25Score: number;
  sbertScore: number;
}

interface AiRerankResponseItem {
  record_id: string;
  hybrid_score: number;
  bm25_score: number;
  sbert_score: number;
}

interface AiRerankResponse {
  results: AiRerankResponseItem[];
}

// AI Microservice'in kendi kategorileri (Türkçe, büyük harf, 7 tane --
// AI Microservice/app/classifier.py CATEGORY_EXAMPLES) backend'in
// MATERIAL_CLASSES'ıyla (İngilizce, küçük harf, 8 tane) örtüşmüyor -- iki ekip
// sözleşmeyi (docs/07) henüz senkronlamadı. "other" karşılığı kasıtlı olarak
// yok: AI servisi prototip-tabanlı, en yakın 7 kategoriden birini seçmek
// zorunda, "bilinmiyor" diye bir çıkışı yok.
const AI_CATEGORY_TO_MATERIAL_CLASS: Record<string, string> = {
  METAL: 'metal',
  PLASTIK: 'plastic',
  ORGANIK: 'organic',
  KIMYASAL: 'chemical',
  TEKSTIL: 'textile',
  CAM: 'glass',
  KAGIT: 'paper',
};

function mapCategory(aiCategory: string): string {
  return AI_CATEGORY_TO_MATERIAL_CLASS[aiCategory] ?? aiCategory.toLowerCase();
}

// AI Microservice/app/embedder.py .encode(..., normalize_embeddings=True) her
// zaman normalize edilmiş vektör üretir, ama gerçek /embed response'u bunu
// raporlamıyor (docs/07 `normalized` alanını bekliyor, `AI Microservice/app/schemas.py`
// sadece {vector, dim} dönüyor) -- burada bilinen-doğru olarak sabitleniyor.
// `model` de gerçek serviste yok; embeddings.service.ts bunu embeddings.model_version
// kolonuna yazıyor, o yüzden AI ekibi modeli değiştirdiğinde burayı da elle güncelle.
const EMBED_MODEL_TAG = 'ai-service-fine-tuned-mpnet-v1';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? 'http://localhost:8000';
const REQUEST_TIMEOUT_MS = 3000; // docs/07: backend timeout 3s, üstü fallback
const RETRY_DELAYS_MS = [500, 1000, 2000]; // docs/07: 3 deneme, 500ms -> 1s -> 2s

// docs/07 circuit breaker eşikleri
const CIRCUIT_WINDOW_MS = 60_000;
const CIRCUIT_MIN_REQUESTS = 20;
const CIRCUIT_FAILURE_RATE = 0.5;
const CIRCUIT_OPEN_DURATION_MS = 30_000;

type CircuitState = 'closed' | 'open' | 'half-open';

// Gerçek HTTP istemcisi -- AI Microservice/ (FastAPI, ayrı ekip) üzerinden
// çalışır. Sözleşme docs/07-ai-entegrasyonu.md'de tanımlı; bu sınıf onu
// AI servisinin GERÇEKTE döndürdüğü şekle uyarlar (yukarıdaki iki fark: kategori
// isimleri ve /embed'in eksik alanları). Çağıran kod (ClassifyResult/EmbedResult
// arayüzü) değişmedi -- materials.service.ts, embeddings.service.ts, ai.service.ts
// hiçbiri dokunulmadı (materials.service.ts'teki tek istisna: AI düşerken
// insan-inceleme kuyruğunun kırılmaması için eklenen try/catch, aşağıya bkz).
@Injectable()
export class AiClientService {
  private readonly logger = new Logger('AiClientService');

  // Rolling 60s pencere -- her istek sonucu (başarı/başarısız) zaman damgasıyla
  // tutulur, pencere dışına çıkanlar her kontrolde budanır. Tek örnek (bu servis
  // NestJS'te singleton) olduğu için embed() ve classify() aynı devreyi paylaşır:
  // AI servisi düştüğünde ikisi için de düşmüş sayılır, docs/07 ayrım yapmıyor.
  private outcomes: Array<{ at: number; ok: boolean }> = [];
  private circuitState: CircuitState = 'closed';
  private openedAt = 0;

  private recordOutcome(ok: boolean): void {
    const now = Date.now();
    this.outcomes = this.outcomes.filter((o) => now - o.at < CIRCUIT_WINDOW_MS);
    this.outcomes.push({ at: now, ok });

    if (this.circuitState === 'half-open') {
      // docs/07: half-open'da tek deneme -- başarılıysa kapanır, değilse tekrar açılır
      this.circuitState = ok ? 'closed' : 'open';
      this.openedAt = now;
      if (this.circuitState === 'closed') this.outcomes = [];
      return;
    }

    if (this.circuitState === 'closed' && this.outcomes.length >= CIRCUIT_MIN_REQUESTS) {
      const failures = this.outcomes.filter((o) => !o.ok).length;
      if (failures / this.outcomes.length >= CIRCUIT_FAILURE_RATE) {
        this.logger.warn(`Circuit breaker acildi: son 60s'de ${failures}/${this.outcomes.length} istek basarisiz.`);
        this.circuitState = 'open';
        this.openedAt = now;
      }
    }
  }

  private canAttempt(): boolean {
    if (this.circuitState === 'closed') return true;
    if (this.circuitState === 'open') {
      if (Date.now() - this.openedAt < CIRCUIT_OPEN_DURATION_MS) return false;
      this.logger.log('Circuit breaker half-open: tek deneme yapılıyor.');
      this.circuitState = 'half-open';
      return true;
    }
    return false; // half-open: deneme zaten sürüyor, ek istek geçmesin
  }

  private async requestWithRetry<T>(path: string, body: unknown): Promise<T> {
    if (!this.canAttempt()) {
      throw new Error(`circuit breaker acik, ${path} denenmedi`);
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
      try {
        const res = await fetch(`${AI_SERVICE_URL}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!res.ok) {
          throw new Error(`AI servisi ${path} icin HTTP ${res.status} dondu`);
        }
        const json = (await res.json()) as T;
        this.recordOutcome(true);
        return json;
      } catch (err) {
        lastError = err;
        if (attempt < RETRY_DELAYS_MS.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
        }
      }
    }
    this.recordOutcome(false);
    throw lastError;
  }

  // docs/07 H1: "canlı öneri" çağrısı -- AI ulaşılamazsa 503 AI_SERVICE_UNAVAILABLE
  // fırlatır, istemci class dropdown'ını açar. materials.service.ts'teki arka-plan
  // (insan-inceleme zenginleştirmesi) çağrısı bunu kendi try/catch'iyle yutuyor.
  async classify(text: string): Promise<ClassifyResult> {
    let raw: AiClassifyResponse;
    try {
      raw = await this.requestWithRetry<AiClassifyResponse>('/classify', { text });
    } catch (err) {
      this.logger.error(`classify() basarisiz, AI servisine ulasilamadi: ${err}`);
      throw new ServiceUnavailableException({
        error: 'AI_SERVICE_UNAVAILABLE',
        message: 'Sınıflandırma servisi şu an kullanılamıyor.',
      });
    }

    const top3 = Object.entries(raw.all_scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category, score]) => [mapCategory(category), score] as [string, number]);

    return {
      materialClass: mapCategory(raw.category),
      confidence: raw.confidence,
      top3,
    };
  }

  // docs/07 H1: "/embed (çıktı kaydı)" -- AI ulaşılamazsa kayıt yine oluşturulmalı,
  // embedding_pending=true kalmalı. O yüzden burada throw ETMİYORUZ: geçersiz bir
  // sentinel dönüyoruz ki embeddings.service.ts'nin zaten var olan
  // `!normalized || dim !== 768` kontrat kontrolü bunu doğal olarak yakalasın --
  // o dosyaya dokunmadan aynı fallback'i elde ediyoruz.
  async embed(text: string): Promise<EmbedResult> {
    try {
      const raw = await this.requestWithRetry<AiEmbedResponse>('/embed', { text });
      return { vector: raw.vector, model: EMBED_MODEL_TAG, dim: raw.dim, normalized: true };
    } catch (err) {
      this.logger.error(`embed() basarisiz, AI servisine ulasilamadi: ${err}`);
      return { vector: [], model: '', dim: 0, normalized: false };
    }
  }

  // Hibrit (BM25+SBERT) yeniden sıralama -- matches.service.ts'in pgvector'den bulduğu
  // adayları gönderir. Stateless: candidates istekle gider, AI hiçbir şey saklamaz.
  // docs/07 H1 "Eşleştirme" satırındaki gibi -- AI'a bağımlı KİLİTLENMEZ: erişilemezse
  // adayları SBERT sırasıyla (hybridScore = sbertSimilarity, bm25Score = 0) olduğu gibi
  // döndürürüz, çağıran taraf bu değişikliği fark etmeden devam eder.
  async rerank(queryText: string, candidates: RerankCandidate[]): Promise<RerankResultItem[]> {
    if (candidates.length === 0) return [];
    try {
      const raw = await this.requestWithRetry<AiRerankResponse>('/rerank', {
        query_text: queryText,
        candidates: candidates.map((c) => ({
          record_id: c.recordId,
          text: c.text,
          sbert_similarity: c.sbertSimilarity,
        })),
      });
      return raw.results.map((r) => ({
        recordId: r.record_id,
        hybridScore: r.hybrid_score,
        bm25Score: r.bm25_score,
        sbertScore: r.sbert_score,
      }));
    } catch (err) {
      this.logger.error(`rerank() basarisiz, AI servisine ulasilamadi: ${err}`);
      return candidates.map((c) => ({
        recordId: c.recordId,
        hybridScore: c.sbertSimilarity,
        bm25Score: 0,
        sbertScore: c.sbertSimilarity,
      }));
    }
  }
}
