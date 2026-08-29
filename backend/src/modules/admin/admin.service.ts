import { Injectable, NotFoundException } from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  listPendingVerifications() {
    return this.prisma.facilityVerification.findMany({
      where: { status: ReviewStatus.PENDING },
      include: { facility: { select: { id: true, name: true, taxId: true, sector: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async approveVerification(id: string, reviewerId: string) {
    const verification = await this.prisma.facilityVerification.findUnique({ where: { id } });
    if (!verification) {
      throw new NotFoundException('Doğrulama kaydı bulunamadı.');
    }

    await this.prisma.$transaction([
      this.prisma.facilityVerification.update({
        where: { id },
        data: { status: ReviewStatus.APPROVED, reviewedBy: reviewerId, reviewedAt: new Date() },
      }),
      this.prisma.facility.update({
        where: { id: verification.facilityId },
        data: { verified: true },
      }),
    ]);

    return { success: true, message: 'Tesis onaylandı.' };
  }

  async rejectVerification(id: string, reviewerId: string, reason: string) {
    const verification = await this.prisma.facilityVerification.findUnique({ where: { id } });
    if (!verification) {
      throw new NotFoundException('Doğrulama kaydı bulunamadı.');
    }

    await this.prisma.facilityVerification.update({
      where: { id },
      data: {
        status: ReviewStatus.REJECTED,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    });

    return { success: true, message: 'Doğrulama reddedildi.' };
  }
}
