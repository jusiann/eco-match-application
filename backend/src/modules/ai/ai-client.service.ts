import { Injectable, Logger } from '@nestjs/common';

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

// DUMMY implementasyon -- gerçek AI servisi (ai-service/, ayrı repo, ekip arkadaşı MIT'nin
// bir eşleştirme modelini kullanacak) henüz yok. Sözleşme docs/07-ai-entegrasyonu.md'de
// tanımlı; bu sınıf o sözleşmeyi birebir taklit ediyor ki gerçek servis hazır olduğunda
// tek yapılması gereken bu dosyanın içini bir HTTP istemcisiyle değiştirmek olsun --
// çağıran kod (AiClientService arayüzü) hiç değişmemeli.
//
// Retry (3 deneme, 500ms->1s->2s) ve circuit breaker (docs/07) burada YOK çünkü sahte
// bir çağrının "başarısız olması" diye bir şey yok -- gerçek HTTP istemcisi yazılırken
// eklenmesi gereken yer burasıdır.
@Injectable()
export class AiClientService {
  private readonly logger = new Logger('AiClientService (dummy)');

  private hashToUnit(text: string, salt = 0): number {
    let hash = salt;
    for (let i = 0; i < text.length; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) | 0;
    }
    return (Math.abs(hash) % 10000) / 10000;
  }

  async classify(text: string): Promise<ClassifyResult> {
    this.logger.debug(`[DUMMY] classify() called, text length=${text.length}`);

    const primaryIndex = Math.floor(this.hashToUnit(text, 1) * MATERIAL_CLASSES.length);
    const primaryClass = MATERIAL_CLASSES[primaryIndex];
    // Bilinçli olarak orta-düşük bir güven aralığı (0.45-0.90) -- gerçek modelin
    // ne kadar emin olacağını taklit etmeye çalışmıyoruz, sadece makul bir dağılım
    const confidence = Number((0.45 + this.hashToUnit(text, 2) * 0.45).toFixed(2));

    const remaining = MATERIAL_CLASSES.filter((c) => c !== primaryClass);
    const secondIndex = Math.floor(this.hashToUnit(text, 3) * remaining.length);
    const secondClass = remaining[secondIndex];
    const thirdClass = remaining.find((c) => c !== secondClass) ?? remaining[0];

    const secondConfidence = Number(((1 - confidence) * 0.6).toFixed(2));
    const thirdConfidence = Number(((1 - confidence) * 0.4).toFixed(2));

    return {
      materialClass: primaryClass,
      confidence,
      top3: [
        [primaryClass, confidence],
        [secondClass, secondConfidence],
        [thirdClass, thirdConfidence],
      ],
    };
  }

  async embed(text: string): Promise<EmbedResult> {
    this.logger.debug(`[DUMMY] embed() called, text length=${text.length}`);

    const dim = 768;
    const raw = Array.from({ length: dim }, () => Math.random() * 2 - 1);
    const magnitude = Math.sqrt(raw.reduce((sum, v) => sum + v * v, 0));
    const vector = raw.map((v) => v / magnitude);

    return { vector, model: 'dummy-stub-v0', dim, normalized: true };
  }
}
