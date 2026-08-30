import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { NotificationsService } from './notifications.service';

// docs/04: her mesaj {type, data} zarfıyla taşınıyor -- Socket.IO'nun kendi event adı
// zaten "type" ile aynı bilgiyi taşısa da, dokümandaki örnek JSON'la birebir uyum için
// zarf payload'ın içine de yazılıyor.
@Injectable()
@WebSocketGateway({ namespace: '/v1/notifications/stream', cors: { origin: '*' } })
export class NotificationsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('NotificationsGateway');

  constructor(
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      const payload = this.jwtService.verify(token);
      if (payload.type) {
        throw new Error('access token değil');
      }
      client.data.userId = payload.sub;
      client.join(`user:${payload.sub}`);
    } catch {
      client.emit('error', { message: 'Kimlik doğrulama başarısız.' });
      client.disconnect(true);
    }
  }

  private extractToken(client: Socket): string {
    const authToken = client.handshake.auth?.token as string | undefined;
    const headerToken = (client.handshake.headers?.authorization as string | undefined)?.replace('Bearer ', '');
    const token = authToken ?? headerToken;
    if (!token) {
      throw new Error('jeton yok');
    }
    return token;
  }

  @SubscribeMessage('notification:mark_read')
  async handleMarkRead(@ConnectedSocket() client: Socket, @MessageBody() body: { data?: { id?: string } }) {
    const userId = client.data.userId as string | undefined;
    const id = body?.data?.id;
    if (!userId || !id) {
      return;
    }
    try {
      await this.notificationsService.markRead(userId, id);
    } catch (err) {
      this.logger.warn(`mark_read başarısız: ${(err as Error).message}`);
    }
  }

  emitToUser(userId: string, type: string, data: unknown): void {
    this.server?.to(`user:${userId}`).emit(type, { type, data });
  }
}
