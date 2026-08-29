import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RejectMatchDto, MatchListQueryDto } from './matches.dto';

const TERMINAL_STATUSES: MatchStatus[] = [MatchStatus.COMPLETED, MatchStatus.REJECTED, MatchStatus.EXPIRED];

type MatchWithParties = {
  id: string;
  outputId: string;
  inputId: string;
  totalScore: number;
  breakdown: unknown;
  status: MatchStatus;
  co2Saved: unknown;
  costSaving: unknown;
  cbamImpact: unknown;
  expiresAt: Date;
  createdAt: Date | null;
  output: { facilityId: string; facility: { sector: string; osb: { name: string } | null } };
  input: { facilityId: string; facility: { sector: string; osb: { name: string } | null } };
};

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  private async getFacilityIdForUser(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { facilityId: true } });
    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }
    return user.facilityId;
  }

  private matchInclude = {
    output: { include: { facility: { include: { osb: { select: { name: true } } } } } },
    input: { include: { facility: { include: { osb: { select: { name: true } } } } } },
  } as const;

  // Gizlilik kuralı (S3): kabul edilene kadar karşı tarafın adı/adresi/iletişimi gösterilmez,
  // sadece OSB adı + sektör. Yaklaşık konum burada hesaplanmıyor (bilinen açık, bkz. K-23).
  private serialize(match: MatchWithParties, viewerFacilityId: string) {
    const isSupplier = match.output.facilityId === viewerFacilityId;
    const counterparty = isSupplier ? match.input.facility : match.output.facility;

    return {
      id: match.id,
      status: match.status,
      role: isSupplier ? 'supplier' : 'consumer',
      totalScore: match.totalScore,
      breakdown: match.breakdown,
      co2Saved: match.co2Saved,
      costSaving: match.costSaving,
      cbamImpact: match.cbamImpact,
      counterparty: {
        osbName: counterparty.osb?.name ?? null,
        sectorLabel: counterparty.sector,
      },
      expiresAt: match.expiresAt,
      createdAt: match.createdAt,
    };
  }

  private assertParty(match: { output: { facilityId: string }; input: { facilityId: string } }, facilityId: string) {
    const isSupplier = match.output.facilityId === facilityId;
    const isConsumer = match.input.facilityId === facilityId;
    if (!isSupplier && !isConsumer) {
      throw new NotFoundException('Eşleşme bulunamadı.');
    }
    return { isSupplier, isConsumer };
  }

  async listMatches(userId: string, query: MatchListQueryDto) {
    const facilityId = await this.getFacilityIdForUser(userId);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const page = Math.max(query.page ?? 1, 1);
    const skip = (page - 1) * limit;

    const where: any = { OR: [{ output: { facilityId } }, { input: { facilityId } }] };
    if (query.status) where.status = query.status.toUpperCase();

    const [matches, total] = await Promise.all([
      this.prisma.match.findMany({ where, include: this.matchInclude, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      this.prisma.match.count({ where }),
    ]);

    return {
      data: matches.map((m) => this.serialize(m as unknown as MatchWithParties, facilityId)),
      meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
    };
  }

  async getMatch(userId: string, id: string) {
    const facilityId = await this.getFacilityIdForUser(userId);
    const match = await this.prisma.match.findUnique({ where: { id }, include: this.matchInclude });
    if (!match) {
      throw new NotFoundException('Eşleşme bulunamadı.');
    }
    this.assertParty(match, facilityId);
    return this.serialize(match as unknown as MatchWithParties, facilityId);
  }

  async accept(userId: string, id: string) {
    const facilityId = await this.getFacilityIdForUser(userId);

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          status: MatchStatus;
          output_id: string;
          input_id: string;
          demand_qty: string | null;
          accepted_by_supplier_at: Date | null;
          accepted_by_consumer_at: Date | null;
          output_facility_id: string;
          output_stock: string;
          input_facility_id: string;
          input_quantity_kg: string;
        }>
      >`
        SELECT m.id, m.status, m.output_id, m.input_id, m.demand_qty,
               m.accepted_by_supplier_at, m.accepted_by_consumer_at,
               o.facility_id AS output_facility_id, o.stock AS output_stock,
               i.facility_id AS input_facility_id, i.quantity_kg AS input_quantity_kg
        FROM matches m
        JOIN outputs o ON o.id = m.output_id
        JOIN inputs i ON i.id = m.input_id
        WHERE m.id = ${id}::uuid
        FOR UPDATE OF m, o
      `;
      const match = rows[0];
      if (!match) {
        throw new NotFoundException('Eşleşme bulunamadı.');
      }

      // $queryRaw ham DB değerini döner (K-09: DB'de lowercase, Prisma Client'ta UPPERCASE).
      // Normal Prisma Client çağrıları bunu otomatik çevirir, raw SQL çevirmez -- burada elle
      // yapılmazsa aşağıdaki tüm MatchStatus karşılaştırmaları sessizce hep false döner.
      const status = match.status.toUpperCase() as MatchStatus;

      const isSupplier = match.output_facility_id === facilityId;
      const isConsumer = match.input_facility_id === facilityId;
      if (!isSupplier && !isConsumer) {
        throw new NotFoundException('Eşleşme bulunamadı.');
      }

      if (TERMINAL_STATUSES.includes(status)) {
        throw new ConflictException({ error: 'INVALID_STATE_TRANSITION', message: 'Bu eşleşme artık işlem kabul etmiyor.' });
      }

      if (status === MatchStatus.PENDING) {
        await tx.match.update({
          where: { id },
          data: {
            status: MatchStatus.ACCEPTED,
            ...(isSupplier ? { acceptedBySupplierAt: new Date() } : { acceptedByConsumerAt: new Date() }),
          },
        });
        return { success: true, status: 'accepted', message: 'Eşleşmeyi kabul ettiniz, karşı tarafın onayı bekleniyor.' };
      }

      // status === ACCEPTED
      const alreadyAcceptedBySelf = isSupplier ? match.accepted_by_supplier_at !== null : match.accepted_by_consumer_at !== null;
      if (alreadyAcceptedBySelf) {
        throw new ConflictException({ error: 'INVALID_STATE_TRANSITION', message: 'Bu eşleşmeyi zaten kabul ettiniz.' });
      }

      const demandQty = Number(match.demand_qty ?? match.input_quantity_kg);
      const outputStock = Number(match.output_stock);
      if (outputStock < demandQty) {
        throw new ConflictException({ error: 'INSUFFICIENT_STOCK', message: 'Tesisin stoğu bu eşleşmeyi tamamlamak için yetersiz.' });
      }

      await tx.match.update({
        where: { id },
        data: {
          status: MatchStatus.COMPLETED,
          ...(isSupplier ? { acceptedBySupplierAt: new Date() } : { acceptedByConsumerAt: new Date() }),
        },
      });
      await tx.output.update({ where: { id: match.output_id }, data: { stock: { decrement: demandQty } } });

      return { success: true, status: 'completed', message: 'Eşleşme tamamlandı! İletişim bilgileri artık görünür.' };
    });
  }

  async reject(userId: string, id: string, dto: RejectMatchDto) {
    const facilityId = await this.getFacilityIdForUser(userId);
    const match = await this.prisma.match.findUnique({
      where: { id },
      include: { output: { select: { facilityId: true } }, input: { select: { facilityId: true } } },
    });
    if (!match) {
      throw new NotFoundException('Eşleşme bulunamadı.');
    }
    this.assertParty(match, facilityId);

    if (TERMINAL_STATUSES.includes(match.status)) {
      throw new ConflictException({ error: 'INVALID_STATE_TRANSITION', message: 'Bu eşleşme artık işlem kabul etmiyor.' });
    }

    await this.prisma.match.update({
      where: { id },
      data: {
        status: MatchStatus.REJECTED,
        rejectionReasonCategory: dto.reasonCategory,
        rejectionReasonText: dto.reasonText,
      },
    });

    return { success: true, message: 'Eşleşme reddedildi.' };
  }

  async getContact(userId: string, id: string) {
    const facilityId = await this.getFacilityIdForUser(userId);
    const match = await this.prisma.match.findUnique({
      where: { id },
      include: {
        output: { include: { facility: { include: { users: true } } } },
        input: { include: { facility: { include: { users: true } } } },
      },
    });
    if (!match) {
      throw new NotFoundException('Eşleşme bulunamadı.');
    }
    const { isSupplier } = this.assertParty(match, facilityId);

    if (match.status !== MatchStatus.COMPLETED) {
      throw new ForbiddenException({ error: 'CONTACT_NOT_AVAILABLE', message: 'İletişim bilgileri karşılıklı onay sonrası açılır.' });
    }

    const counterpartyFacility = isSupplier ? match.input.facility : match.output.facility;
    const contactUser =
      counterpartyFacility.users.find((u) => u.role === 'FACILITY_ADMIN') ?? counterpartyFacility.users[0];

    return {
      companyName: counterpartyFacility.name,
      contactName: contactUser?.contactName ?? null,
      email: contactUser?.email ?? null,
      phone: contactUser?.phone ?? null,
    };
  }
}
