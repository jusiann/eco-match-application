import { Injectable, Logger } from '@nestjs/common';
import { Output, Input, MaterialClass, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AiClientService } from '../ai/ai-client.service';

type RecordType = 'input' | 'output';

// matches.service.ts'in hibrit rerank için pgvector satırından yeniden kullandığı
// alanlar -- tam Output/Input yerine bu daraltılmış şekli almak, raw SQL satırını
// (Decimal değil string quantity_kg, vs.) sahte bir Prisma nesnesine cast etmeden
// aynı metin kurma mantığını paylaşmayı sağlıyor.
type MaterialTextFields = {
  materialClass: MaterialClass | null;
  description: string;
  quantityKg: Prisma.Decimal | string | number;
};

// docs/07: metni backend hazırlar, AI servisi (dummy ya da gerçek) sadece vektöre çevirir.
@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger('EmbeddingsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiClient: AiClientService,
  ) {}

  // public: matches.service.ts hibrit rerank için AYNI metni (embedding'e giren metin)
  // AI'a gönderir -- BM25 ve SBERT farklı metinleri tokenize/vektörlerse füzyon anlamsız olur.
  buildOutputText(output: MaterialTextFields & { composition: unknown }): string {
    const composition = output.composition as Record<string, number> | null;
    return [
      `Malzeme: ${output.materialClass}`,
      output.description,
      composition
        ? `Bileşim: ${Object.entries(composition).map(([k, v]) => `${k} %${v}`).join(', ')}`
        : null,
      `Miktar: ${output.quantityKg} kg`,
    ]
      .filter(Boolean)
      .join('. ');
  }

  buildInputText(input: MaterialTextFields & { specs: unknown }): string {
    const specs = input.specs as Record<string, unknown> | null;
    return [
      `Malzeme: ${input.materialClass}`,
      input.description,
      specs ? `Aranan özellikler: ${Object.entries(specs).map(([k, v]) => `${k}: ${v}`).join(', ')}` : null,
      `Miktar: ${input.quantityKg} kg`,
    ]
      .filter(Boolean)
      .join('. ');
  }

  // true dönerse embedding_pending=false yapılmıştır; çağıran kod bunu response'a yansıtır
  async embedOutput(output: Output): Promise<boolean> {
    const wrote = await this.writeEmbedding(output.id, 'output', this.buildOutputText(output));
    if (wrote) {
      await this.prisma.output.update({ where: { id: output.id }, data: { embeddingPending: false } });
    }
    return wrote;
  }

  async embedInput(input: Input): Promise<boolean> {
    const wrote = await this.writeEmbedding(input.id, 'input', this.buildInputText(input));
    if (wrote) {
      await this.prisma.input.update({ where: { id: input.id }, data: { embeddingPending: false } });
    }
    return wrote;
  }

  private async writeEmbedding(recordId: string, recordType: RecordType, text: string): Promise<boolean> {
    const { vector, model, dim, normalized } = await this.aiClient.embed(text);

    if (!normalized || dim !== 768 || vector.length !== 768) {
      // docs/07: kontrat ihlali -- kayıt embedding_pending=true kalır, yanlış vektör sessizce yazılmaz
      this.logger.error(`AI contract violation: normalized=${normalized} dim=${dim} length=${vector.length}`);
      return false;
    }

    await this.prisma.$executeRaw`
      INSERT INTO embeddings (record_id, record_type, vector, model_version)
      VALUES (${recordId}::uuid, ${recordType}::record_type,
              ${`[${vector.join(',')}]`}::vector, ${model})
      ON CONFLICT (record_id, record_type)
      DO UPDATE SET vector = EXCLUDED.vector, model_version = EXCLUDED.model_version
    `;
    return true;
  }
}
