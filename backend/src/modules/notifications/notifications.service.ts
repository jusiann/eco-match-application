import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import { MANDATORY_NOTIFICATION_TYPES, ListNotificationsQueryDto, UpdatePrefsBody } from './notifications.dto';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => NotificationsGateway))
    private readonly gateway: NotificationsGateway,
  ) {}

  // Faz 2'nin geri kalanı (HITL, matches) bunu çağırır -- diğer modüller notification_prefs'i
  // bilmek zorunda kalmasın diye "gönderilsin mi" kararı burada veriliyor.
  async create(userId: string, type: string, title: string, body?: string, payload?: Record<string, unknown>) {
    const notification = await this.prisma.notification.create({
      data: { userId, type, title, body, payload: payload as Prisma.InputJsonValue },
    });

    const pref = await this.prisma.notificationPref.findUnique({ where: { userId_type: { userId, type } } });
    const inApp = pref ? pref.inApp : true; // şema default'u: true

    if (inApp) {
      this.gateway.emitToUser(userId, 'notification:new', {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        payload: notification.payload,
        created_at: notification.createdAt,
      });
      this.gateway.emitToUser(userId, 'notification:unread_count', { count: await this.unreadCount(userId) });
    }

    return notification;
  }

  async list(userId: string, query: ListNotificationsQueryDto) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const page = Math.max(query.page ?? 1, 1);
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = { userId };
    if (query.unread) {
      where.readAt = null;
    }

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      this.prisma.notification.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) } };
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Bildirim bulunamadı.');
    }
    if (!notification.readAt) {
      await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
    }
    return { success: true, message: 'Bildirim okundu olarak işaretlendi.' };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { success: true, message: 'Tüm bildirimler okundu olarak işaretlendi.' };
  }

  async getPrefs(userId: string) {
    const prefs = await this.prisma.notificationPref.findMany({ where: { userId } });
    const result: Record<string, { inApp: boolean; email: boolean; push: boolean }> = {};
    for (const p of prefs) {
      result[p.type] = { inApp: p.inApp, email: p.email, push: p.push };
    }
    return result;
  }

  async updatePrefs(userId: string, body: UpdatePrefsBody) {
    const entries = Object.entries(body ?? {});
    if (entries.length === 0) {
      throw new BadRequestException({ error: 'VALIDATION_ERROR', message: 'Güncellenecek en az bir bildirim tipi gönderilmelidir.' });
    }

    for (const [type, entry] of entries) {
      if (typeof entry !== 'object' || entry === null) {
        throw new BadRequestException({ error: 'VALIDATION_ERROR', message: `${type} için geçersiz tercih nesnesi.` });
      }
      const { inApp, email, push } = entry;
      if (typeof inApp !== 'boolean' || typeof email !== 'boolean' || typeof push !== 'boolean') {
        throw new BadRequestException({ error: 'VALIDATION_ERROR', message: `${type} için inApp/email/push boolean olmalıdır.` });
      }
      if (MANDATORY_NOTIFICATION_TYPES.includes(type) && inApp === false) {
        throw new BadRequestException({ error: 'VALIDATION_ERROR', message: `${type} zorunlu bir bildirim tipidir, inApp kapatılamaz.` });
      }
    }

    await this.prisma.$transaction(
      entries.map(([type, entry]) =>
        this.prisma.notificationPref.upsert({
          where: { userId_type: { userId, type } },
          create: { userId, type, inApp: entry.inApp, email: entry.email, push: entry.push },
          update: { inApp: entry.inApp, email: entry.email, push: entry.push },
        }),
      ),
    );

    return { success: true, message: 'Bildirim tercihleri güncellendi.' };
  }
}
