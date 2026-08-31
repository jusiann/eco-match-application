import { Injectable, NotFoundException } from '@nestjs/common';
import { ChatRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ClaudeClientService, ChatHistoryMessage } from './claude-client.service';
import { ChatHistoryQueryDto } from './chat.dto';

const CONTEXT_SIZE = 10; // docs/06 S6: "Backend son 10 mesajı context olarak okur"

// Dummy istemcinin gerçek bir token sayacı yok -- kabaca 4 karakter = 1 token varsayımı,
// sadece token_cost alanının dolu olması ve gerçek entegrasyonda aynı yerde gerçek
// kullanım verisiyle değiştirilebilmesi için (docs/06: "token maliyeti kullanıcı bazında loglanır").
const estimateTokens = (text: string): number => Math.max(1, Math.ceil(text.length / 4));

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly claudeClient: ClaudeClientService,
  ) {}

  private async loadContext(sessionId: string): Promise<ChatHistoryMessage[]> {
    const rows = await this.prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: CONTEXT_SIZE,
    });
    return rows.reverse().map((r) => ({ role: r.role === ChatRole.USER ? 'user' : 'assistant', content: r.content }));
  }

  // SSE akışı başladıktan (writeHead(200)) sonra HTTP durum kodu değiştirilemez -- bu yüzden
  // "oturum bulunamadı" gibi gerçek bir 404, akış başlamadan ÖNCE controller'da kontrol
  // edilmeli. Bkz. chat.controller.ts.
  async assertSessionOwnership(userId: string, sessionId: string): Promise<void> {
    const owned = await this.prisma.message.findFirst({ where: { sessionId, userId }, select: { id: true } });
    if (!owned) {
      throw new NotFoundException({ error: 'CHAT_SESSION_NOT_FOUND', message: 'Konuşma oturumu bulunamadı.' });
    }
  }

  // SSE akışını controller yönetiyor (Fastify raw response gerekiyor); bu servis sadece
  // iş mantığını (context okuma, kullanıcı mesajını kaydetme, dummy stream'i sarmalama,
  // asistan mesajını SADECE akış tamamlanınca kaydetme) sağlıyor.
  async *handleMessage(
    userId: string,
    message: string,
    sessionId: string | undefined,
  ): AsyncGenerator<{ event: 'session' | 'delta' | 'done' | 'error'; data: unknown }> {
    const isNewSession = !sessionId;
    const history = sessionId ? await this.loadContext(sessionId) : [];

    const userMsg = await this.prisma.message.create({
      data: {
        userId,
        ...(sessionId ? { sessionId } : {}),
        role: ChatRole.USER,
        content: message,
        tokenCost: estimateTokens(message),
      },
    });

    if (isNewSession) {
      yield { event: 'session', data: { sessionId: userMsg.sessionId } };
    }

    let full = '';
    try {
      for await (const chunk of this.claudeClient.stream(message, history)) {
        full += chunk;
        yield { event: 'delta', data: { delta: chunk } };
      }
    } catch (err: any) {
      // S6: "Claude API down" -- kullanıcıya hata gösterilir, assistant mesajı KAYDEDİLMEZ
      // (kullanıcının kendi mesajı zaten yukarıda kaydedildi, bu doğru -- konuşma geçmişinde
      // "soruldu ama cevaplanamadı" izi kalması gerekiyor).
      yield {
        event: 'error',
        data: err?.response ?? { error: 'AI_SERVICE_UNAVAILABLE', message: 'Şu an chatbot müsait değil.' },
      };
      return;
    }

    const assistantMsg = await this.prisma.message.create({
      data: {
        userId,
        sessionId: userMsg.sessionId,
        role: ChatRole.ASSISTANT,
        content: full,
        tokenCost: estimateTokens(full),
      },
    });

    yield { event: 'done', data: { sessionId: userMsg.sessionId, messageId: assistantMsg.id } };
  }

  async history(userId: string, query: ChatHistoryQueryDto) {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);

    let sessionId = query.sessionId;
    if (!sessionId) {
      const latest = await this.prisma.message.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { sessionId: true },
      });
      if (!latest) {
        return { sessionId: null, messages: [] };
      }
      sessionId = latest.sessionId;
    }

    const rows = await this.prisma.message.findMany({
      where: { userId, sessionId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return {
      sessionId,
      messages: rows.map((r) => ({
        id: r.id,
        role: r.role === ChatRole.USER ? 'user' : 'assistant',
        content: r.content,
        createdAt: r.createdAt,
      })),
    };
  }
}
