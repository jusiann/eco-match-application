import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import { MatchStatus, ReviewStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReviewQueueService } from '../admin/review-queue.service';
import { IotService } from '../iot/iot.service';

// @Cron ile işaretli metotlar sadece zamanlamayı tetikler; asıl mantık ayrı, argümansız
// public metotlarda -- testler (ve manuel tetikleme) 72 saat/gece yarısı beklemeden
// bunları doğrudan çağırabilir.
@Injectable()
export class CronService {
  private readonly logger = new Logger('CronService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly reviewQueueService: ReviewQueueService,
    private readonly iotService: IotService,
  ) {}

  @Cron('0 3 * * *') // A3: her gece 03:00
  async expireOldMatchesJob() {
    const count = await this.expireOldMatches();
    if (count > 0) this.logger.log(`${count} eşleşme süresi doldu olarak işaretlendi.`);
  }

  async expireOldMatches(): Promise<number> {
    const expiring = await this.prisma.match.findMany({
      where: { expiresAt: { lt: new Date() }, status: { in: [MatchStatus.PENDING, MatchStatus.ACCEPTED] } },
      include: {
        output: { include: { facility: { include: { users: true } } } },
        input: { include: { facility: { include: { users: true } } } },
      },
    });

    for (const match of expiring) {
      await this.prisma.match.update({ where: { id: match.id }, data: { status: MatchStatus.EXPIRED } });

      const supplierOwner = match.output.facility.users.find((u) => u.role === 'FACILITY_ADMIN');
      const consumerOwner = match.input.facility.users.find((u) => u.role === 'FACILITY_ADMIN');
      for (const owner of [supplierOwner, consumerOwner]) {
        if (owner) {
          await this.notificationsService.create(
            owner.id,
            'match_expired',
            'Eşleşmenizin süresi doldu',
            '30 gün içinde karşılıklı onay verilmediği için bir eşleşme süresi doldu.',
            { match_id: match.id },
          );
        }
      }
    }

    return expiring.length;
  }

  @Cron(CronExpression.EVERY_HOUR) // A2: 72 saat SLA -- saatlik kontrol yeterli hassasiyette
  async hitlSlaFallbackJob(): Promise<number> {
    const count = await this.reviewQueueService.applySlaFallback();
    if (count > 0) this.logger.log(`${count} inceleme SLA fallback ile otomatik onaylandı.`);
    return count;
  }

  @Cron('0 4 * * 1') // Pazartesi 04:00
  async weeklyFeedbackExportJob() {
    const result = await this.exportWeeklyFeedback();
    this.logger.log(`Haftalık geri besleme: ${result.rejections} red, ${result.humanReviewed} uzman incelemesi export edildi.`);
  }

  async exportWeeklyFeedback(): Promise<{ rejections: number; humanReviewed: number }> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const feedbackDir = path.join(process.cwd(), 'training', 'feedback');
    await fs.promises.mkdir(feedbackDir, { recursive: true });

    const rejectedMatches = await this.prisma.match.findMany({
      where: { status: MatchStatus.REJECTED, createdAt: { gte: since } },
      select: { id: true, rejectionReasonCategory: true, createdAt: true },
    });
    const rejectionLines = rejectedMatches.map((m) =>
      JSON.stringify({ match_id: m.id, category: m.rejectionReasonCategory, created_at: m.createdAt }),
    );
    await fs.promises.writeFile(
      path.join(feedbackDir, 'rejections.jsonl'),
      rejectionLines.length ? rejectionLines.join('\n') + '\n' : '',
    );

    const reviewed = await this.prisma.humanReviewQueue.findMany({
      where: { status: { in: [ReviewStatus.APPROVED, ReviewStatus.REJECTED] }, reviewedAt: { gte: since } },
      include: { output: true },
    });
    const humanReviewedLines = reviewed.map((r) => {
      const top3 = r.aiSuggestion as unknown as Array<[string, number]> | null;
      return JSON.stringify({
        text: r.output?.description ?? null,
        ai_prediction: top3?.[0]?.[0] ?? null,
        ai_confidence: Number(r.confidence),
        human_label: r.output?.materialClass ?? null,
        notes: r.notes,
      });
    });
    await fs.promises.writeFile(
      path.join(process.cwd(), 'training', 'human_reviewed.jsonl'),
      humanReviewedLines.length ? humanReviewedLines.join('\n') + '\n' : '',
    );

    return { rejections: rejectedMatches.length, humanReviewed: reviewed.length };
  }

  @Cron(CronExpression.EVERY_5_MINUTES) // I2: "Backend 5 dakikada bir sensor_data.timestamp kontrol eder"
  async iotHeartbeatJob() {
    const result = await this.iotService.checkHeartbeats();
    if (result.offline > 0 || result.online > 0) {
      this.logger.log(`IoT heartbeat: ${result.offline} tesis offline, ${result.online} tesis online oldu.`);
    }
    return result;
  }
}
