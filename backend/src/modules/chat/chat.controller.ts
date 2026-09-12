import { Controller, Post, Get, Body, Query, UseGuards, Res } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { ChatService } from './chat.service';
import { ChatMessageDto, ChatHistoryQueryDto } from './chat.dto';

// `history` route'unun kendi @Throttle'ı yok, docs/04'te de chat-daily'ye tabi değil --
// bu class-level muafiyet onu kapsar. `chat`'in kendi method-level @Throttle'ı 'chat-daily'yi
// açıkça yeniden içerdiği için (aşağıda) o route için muafiyet geçersiz kalır.
@SkipThrottle({ 'chat-daily': true })
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // docs/04 Rate limit: 10/dk VE 50/gün, ikisi de aynı anda uygulanıyor -- 'chat-daily'
  // app.module.ts'de ayrı bir isimle kayıtlı ikinci bir throttler bucket'ı.
  @Throttle({ default: { limit: 10, ttl: 60 * 1000 }, 'chat-daily': { limit: 50, ttl: 24 * 60 * 60 * 1000 } })
  @Post()
  async chat(@GetUser() user: { sub: string }, @Body() dto: ChatMessageDto, @Res() reply: FastifyReply) {
    if (dto.sessionId) {
      await this.chatService.assertSessionOwnership(user.sub, dto.sessionId); // 200 yazılmadan ÖNCE, gerçek 404 dönebilsin
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    for await (const chunk of this.chatService.handleMessage(user.sub, dto.message, dto.sessionId)) {
      reply.raw.write(`event: ${chunk.event}\ndata: ${JSON.stringify(chunk.data)}\n\n`);
    }

    reply.raw.end();
  }

  @Get('history')
  history(@GetUser() user: { sub: string }, @Query() query: ChatHistoryQueryDto) {
    return this.chatService.history(user.sub, query);
  }
}
