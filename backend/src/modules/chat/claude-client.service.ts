import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Test ortamında gerçek bir "Claude API 503 döner" durumunu tetiklemenin başka bir yolu
// yok -- dummy istemci hiçbir zaman organik olarak başarısız olmuyor (AiClientService'teki
// aynı gerekçe: sahte bir çağrının "başarısız olması" diye bir şey yok). S6'nın "Claude API
// down" senaryosunu e2e ile gerçekten kanıtlayabilmek için bilinçli bir test kancası:
// mesaj TAM OLARAK bu sabitse dummy istemci gerçek bir 503 fırlatır.
export const SIMULATE_DOWN_SENTINEL = '__SIMULATE_CLAUDE_DOWN__';

const CANNED_TOPICS: Array<{ keywords: string[]; reply: string }> = [
  {
    keywords: ['dpp', 'dijital ürün pasaportu'],
    reply:
      'Dijital Ürün Pasaportu (DPP), bir malzeme veya ürünün bileşimi, kaynağı ve çevresel ' +
      'etkisi hakkındaki bilgileri dijital olarak taşıyan, AB ESPR düzenlemesinin öngördüğü ' +
      'bir belgedir. EcoMatch, her çıktı kaydı için bunu otomatik üretir ve QR kod ile ' +
      'sevkiyat sırasında doğrulanabilir hale getirir.',
  },
  {
    keywords: ['cbam'],
    reply:
      'CBAM (Karbon Sınırında Karbon Düzenleme Mekanizması), AB\'ye ithal edilen bazı ürünlerin ' +
      'karbon ayak izine göre ek vergi uygulayan bir AB mekanizmasıdır. EcoMatch, eşleşmeleriniz ' +
      'üzerinden ne kadar CBAM tasarrufu sağladığınızı raporlar.',
  },
  {
    keywords: ['eşleş', 'match', 'simbiyoz'],
    reply:
      'EcoMatch, çıktınızı (atık/yan ürün) embedding benzerliği, kalite, çevresel etki, ' +
      'lojistik ve ekonomik faktörleri ağırlıklandırarak potansiyel alıcı tesislerle eşleştirir. ' +
      '"Eşleştirmeleri Bul" ekranından adaylarınızı görebilirsiniz.',
  },
];

const FALLBACK_REPLY =
  'Bu konuda şu an elimde net bir cevap yok, ama EcoMatch ekibine ' +
  'dashboard üzerinden destek talebi açabilirsiniz. Başka nasıl yardımcı olabilirim?';

// DUMMY implementasyon -- gerçek Claude API entegrasyonu (Anthropic SDK, ANTHROPIC_API_KEY)
// henüz bağlı değil (Faz 3.3, K-31). Sözleşme (mesaj listesi -> parça parça metin) gerçek bir
// SDK streaming çağrısıyla birebir aynı şekilde kullanılabilir olacak şekilde tasarlandı;
// gerçek entegrasyon geldiğinde tek değişecek yer bu dosyanın `stream()` metodunun içi.
@Injectable()
export class ClaudeClientService {
  private readonly logger = new Logger('ClaudeClientService (dummy)');

  private buildReply(userMessage: string): string {
    const lower = userMessage.toLowerCase();
    const topic = CANNED_TOPICS.find((t) => t.keywords.some((k) => lower.includes(k)));
    return topic?.reply ?? FALLBACK_REPLY;
  }

  // history şu an dummy cevabın içeriğini etkilemiyor (gerçek anlamda "bağlam anlama" sahte
  // bir istemciden beklenemez) ama gerçek SDK çağrısının alacağı şekliyle taşınıyor --
  // gerçek entegrasyonda mesaj dizisi doğrudan buraya iletilecek.
  async *stream(userMessage: string, _history: ChatHistoryMessage[]): AsyncGenerator<string> {
    if (userMessage === SIMULATE_DOWN_SENTINEL) {
      this.logger.warn('[DUMMY] Claude API kesintisi simüle ediliyor (test kancası).');
      throw new ServiceUnavailableException({
        error: 'AI_SERVICE_UNAVAILABLE',
        message: 'Şu an chatbot müsait değil.',
      });
    }

    this.logger.debug(`[DUMMY] stream() called, message length=${userMessage.length}`);
    const reply = this.buildReply(userMessage);

    const chunkSize = 12;
    for (let i = 0; i < reply.length; i += chunkSize) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      yield reply.slice(i, i + chunkSize);
    }
  }
}
