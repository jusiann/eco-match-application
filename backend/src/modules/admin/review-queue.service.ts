import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { MaterialClass, Prisma, ReviewStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingsService } from '../materials/embeddings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ApproveReviewDto, RejectReviewDto, ReviewQueueListQueryDto } from './review-queue.dto';

const SLA_HOURS = 72;

@Injectable()
export class ReviewQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async list(query: ReviewQueueListQueryDto) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const page = Math.max(query.page ?? 1, 1);
    const skip = (page - 1) * limit;

    const where: Prisma.HumanReviewQueueWhereInput = { status: ReviewStatus.PENDING };
    if (query.minConfidence !== undefined) {
      where.confidence = { gte: query.minConfidence };
    }
    if (query.sector) {
      where.output = { facility: { sector: query.sector } };
    }

    const [data, total] = await Promise.all([
      this.prisma.humanReviewQueue.findMany({
        where,
        include: { output: { include: { facility: { select: { name: true, sector: true } } } } },
        orderBy: { createdAt: 'asc' }, // FIFO (docs/04)
        skip,
        take: limit,
      }),
      this.prisma.humanReviewQueue.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) } };
  }

  async detail(id: string) {
    const item = await this.prisma.humanReviewQueue.findUnique({
      where: { id },
      include: { output: { include: { facility: { select: { id: true, name: true, sector: true } } } } },
    });
    if (!item) {
      throw new NotFoundException('İnceleme kaydı bulunamadı.');
    }

    // docs/06 A2 adım 6: kullanıcının önceki 5 kaydı
    const previousRecords = item.output
      ? await this.prisma.output.findMany({
          where: { facilityId: item.output.facilityId, id: { not: item.output.id } },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, description: true, materialClass: true, createdAt: true },
        })
      : [];

    return { ...item, previousRecords };
  }

  private async getPendingOrThrow(id: string) {
    const item = await this.prisma.humanReviewQueue.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException('İnceleme kaydı bulunamadı.');
    }
    if (item.status !== ReviewStatus.PENDING) {
      throw new ConflictException({ error: 'INVALID_STATE_TRANSITION', message: 'Bu inceleme kaydı zaten sonuçlandırılmış.' });
    }
    if (!item.outputId) {
      // Şema matchId'yi de destekliyor ama Faz 2'de sadece output sınıflandırması var (K-26)
      throw new BadRequestException('Bu inceleme kaydı bir çıktıya bağlı değil.');
    }
    return item;
  }

  private async notifyOwner(facilityId: string, type: string, title: string, body: string, payload: Record<string, unknown>) {
    const owner = await this.prisma.user.findFirst({ where: { facilityId, role: 'FACILITY_ADMIN' } });
    if (owner) {
      await this.notificationsService.create(owner.id, type, title, body, payload);
    }
  }

  async approve(id: string, reviewerId: string, dto: ApproveReviewDto) {
    const item = await this.getPendingOrThrow(id);

    const updatedOutput = await this.prisma.output.update({
      where: { id: item.outputId! },
      data: { materialClass: dto.materialClass.toUpperCase() as MaterialClass, pendingReview: false },
    });
    await this.embeddingsService.embedOutput(updatedOutput);

    await this.prisma.humanReviewQueue.update({
      where: { id },
      data: { status: ReviewStatus.APPROVED, reviewedBy: reviewerId, reviewedAt: new Date(), notes: dto.notes },
    });

    await this.notifyOwner(
      updatedOutput.facilityId,
      'classification_approved',
      'Sınıflandırmanız onaylandı',
      `Çıktınız "${dto.materialClass}" olarak sınıflandırıldı, artık eşleştirmeye açık.`,
      { output_id: updatedOutput.id },
    );

    return { success: true, message: 'Sınıflandırma onaylandı.' };
  }

  async reject(id: string, reviewerId: string, dto: RejectReviewDto) {
    const item = await this.getPendingOrThrow(id);

    await this.prisma.humanReviewQueue.update({
      where: { id },
      data: { status: ReviewStatus.REJECTED, reviewedBy: reviewerId, reviewedAt: new Date(), notes: dto.notes },
    });

    if (item.outputId) {
      const output = await this.prisma.output.findUnique({ where: { id: item.outputId } });
      if (output) {
        await this.notifyOwner(
          output.facilityId,
          'classification_rejected',
          'Sınıflandırma reddedildi',
          'Çıktınızın açıklaması yetersiz bulundu, lütfen daha fazla ayrıntıyla güncelleyin.',
          { output_id: output.id },
        );
      }
    }

    return { success: true, message: 'İnceleme reddedildi.' };
  }

  // Faz 2.3: 72 saat SLA -- kimse bakmazsa AI'ın ilk tahmini otomatik uygulanır.
  // Cron (Faz 2.7 ile aynı modülde) bunu periyodik çağırır; burada manuel/test için de
  // doğrudan çağrılabilir bir servis metodu olarak duruyor.
  async applySlaFallback(): Promise<number> {
    const cutoff = new Date(Date.now() - SLA_HOURS * 60 * 60 * 1000);
    const stale = await this.prisma.humanReviewQueue.findMany({
      where: { status: ReviewStatus.PENDING, createdAt: { lte: cutoff } },
    });

    let applied = 0;
    for (const item of stale) {
      if (!item.outputId || !item.aiSuggestion) continue;
      const top3 = item.aiSuggestion as unknown as Array<[string, number]>;
      const materialClass = top3[0]?.[0];
      if (!materialClass) continue;

      const updatedOutput = await this.prisma.output.update({
        where: { id: item.outputId },
        data: { materialClass: materialClass.toUpperCase() as MaterialClass, pendingReview: false },
      });
      await this.embeddingsService.embedOutput(updatedOutput);

      await this.prisma.humanReviewQueue.update({
        where: { id: item.id },
        data: { status: ReviewStatus.APPROVED, notes: `SLA ${SLA_HOURS} saat doldu, AI'ın ilk tahmini otomatik uygulandı.` },
      });

      await this.notifyOwner(
        updatedOutput.facilityId,
        'classification_approved',
        'Sınıflandırmanız otomatik onaylandı',
        `Uzman incelemesi ${SLA_HOURS} saat içinde yapılamadı, AI önerisi ("${materialClass}") otomatik uygulandı.`,
        { output_id: updatedOutput.id },
      );

      applied++;
    }

    return applied;
  }
}
