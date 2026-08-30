import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { MatchStatus, MaterialClass, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SystemConfigService } from '../../common/services/system-config.service';
import { ScoringService, CarbonFactors } from './scoring.service';
import { RejectMatchDto, MatchListQueryDto } from './matches.dto';

const TERMINAL_STATUSES: MatchStatus[] = [MatchStatus.COMPLETED, MatchStatus.REJECTED, MatchStatus.EXPIRED];

interface CandidateRow {
  id: string;
  facility_id: string;
  quantity_kg: string;
  specs: Record<string, unknown> | null;
  similarity: number;
  distance_km: number | null;
  sector: string;
  osb_name: string | null;
  lat: number | null;
  lng: number | null;
}

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringService: ScoringService,
    private readonly systemConfig: SystemConfigService,
  ) {}

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

  // Faz 2.8 (A3): sadece expired eşleşmeler yeniden denenebilir. Eski satır expired
  // olarak kalır (audit izi), skor/CBAM yeniden hesaplanmaz -- aynı veriyle yeni bir
  // 30 günlük şans açılır. Yeniden skorlama isteniyorsa kullanıcı find'ı tekrar çağırmalı.
  async retry(userId: string, id: string) {
    const facilityId = await this.getFacilityIdForUser(userId);
    const match = await this.prisma.match.findUnique({
      where: { id },
      include: { output: { select: { facilityId: true } }, input: { select: { facilityId: true } } },
    });
    if (!match) {
      throw new NotFoundException('Eşleşme bulunamadı.');
    }
    this.assertParty(match, facilityId);

    if (match.status !== MatchStatus.EXPIRED) {
      throw new ConflictException({ error: 'INVALID_STATE_TRANSITION', message: 'Sadece süresi dolmuş eşleşmeler yeniden denenebilir.' });
    }

    const expiryDays = await this.systemConfig.getNumber('match.expiry_days', 30);
    const newMatch = await this.prisma.match.create({
      data: {
        outputId: match.outputId,
        inputId: match.inputId,
        totalScore: match.totalScore,
        breakdown: match.breakdown as Prisma.InputJsonValue,
        demandQty: match.demandQty,
        co2Saved: match.co2Saved,
        costSaving: match.costSaving,
        cbamImpact: match.cbamImpact,
        status: MatchStatus.PENDING,
        expiresAt: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
      },
    });

    return { success: true, matchId: newMatch.id, message: 'Eşleşme yeniden başlatıldı.' };
  }

  // ── Aday bulma + skorlama (Faz 1.7/1.8/1.9) ──
  // AiClient dummy olsa da (K-24) bu metodun tamamı gerçek: pgvector benzerlik araması,
  // eşik/self-match filtreleri, 5 faktörlü skor, CBAM -- hepsi docs/05'teki formüllerle.

  private async getCarbonFactors(materialClass: MaterialClass | null): Promise<CarbonFactors> {
    if (!materialClass) {
      return { virgin: 0, secondary: 0 };
    }
    const now = new Date();
    const rows = await this.prisma.carbonFactor.findMany({
      where: {
        materialClass,
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gt: now } }],
      },
    });
    const virgin = rows.find((r) => r.factorType === 'virgin')?.co2PerKg;
    const secondary = rows.find((r) => r.factorType === 'secondary')?.co2PerKg;
    return { virgin: Number(virgin ?? 0), secondary: Number(secondary ?? 0) };
  }

  async findCandidates(userId: string, outputId: string) {
    const facilityId = await this.getFacilityIdForUser(userId);
    const output = await this.prisma.output.findUnique({ where: { id: outputId } });
    if (!output || output.facilityId !== facilityId) {
      throw new NotFoundException('Çıktı bulunamadı.');
    }

    // docs/05 filtreleri: sınıfı belirsiz veya vektörü olmayan çıktı aranamaz (A2, H1)
    if (output.pendingReview || output.embeddingPending) {
      return { error: 'PENDING_EXPERT_REVIEW', message: 'Eşleştirme uzman onayı sonrası hazır olacak.' };
    }
    if (!output.availability) {
      return { matches: [], message: 'Şu an uygun eşleşme yok. Yeni tesisler eklendiğinde bildirim alacaksınız.' };
    }

    const threshold = await this.systemConfig.getNumber('match.threshold', 0.6);
    const topK = await this.systemConfig.getNumber('match.top_k', 20);
    const topN = await this.systemConfig.getNumber('match.top_n', 10);
    const expiryDays = await this.systemConfig.getNumber('match.expiry_days', 30);

    const weights = await this.prisma.weightsConfig.findFirst({ where: { active: true } });
    if (!weights) {
      // seed'de her zaman bir aktif satır var (009_seed.sql) -- pratikte tetiklenmemeli
      throw new NotFoundException('Aktif ağırlık konfigürasyonu bulunamadı.');
    }

    const carbonFactors = await this.getCarbonFactors(output.materialClass);
    const carbonPrice = await this.systemConfig.getNumber('cbam.carbon_price_eur_per_ton', 85);

    // docs/03 "Vektör ve coğrafya sorguları" referans sorgusuyla birebir aynı desende
    const rows = await this.prisma.$queryRaw<CandidateRow[]>`
      SELECT i.id, i.facility_id, i.quantity_kg, i.specs,
             1 - (e_out.vector <=> e_in.vector) AS similarity,
             ST_Distance(f_out.location, f_in.location) / 1000 AS distance_km,
             f_in.sector AS sector,
             osb_in.name AS osb_name,
             ST_Y(f_in.location::geometry) AS lat,
             ST_X(f_in.location::geometry) AS lng
        FROM inputs i
        JOIN embeddings e_in ON e_in.record_id = i.id AND e_in.record_type = 'input'
        JOIN facilities f_in ON f_in.id = i.facility_id
        LEFT JOIN osbs osb_in ON osb_in.id = f_in.osb_id
        JOIN outputs o ON o.id = ${outputId}::uuid
        JOIN facilities f_out ON f_out.id = o.facility_id
        JOIN embeddings e_out ON e_out.record_id = o.id AND e_out.record_type = 'output'
       WHERE i.facility_id <> o.facility_id
         AND i.active = TRUE
         AND i.pending_review = FALSE
         AND f_in.verified = TRUE
         AND 1 - (e_out.vector <=> e_in.vector) >= ${threshold}
       ORDER BY similarity DESC
       LIMIT ${topK}
    `;

    if (rows.length === 0) {
      return { matches: [], message: 'Şu an uygun eşleşme yok. Yeni tesisler eklendiğinde bildirim alacaksınız.' };
    }

    const supplyKg = Number(output.stock);
    const scored = rows.map((row) => {
      const demandKg = Number(row.quantity_kg);
      const matchedQty = Math.min(supplyKg, demandKg);
      const distanceKm = row.distance_km !== null ? Number(row.distance_km) : null;

      const { score: materialRaw, quantityRatio } = this.scoringService.materialScore(row.similarity, supplyKg, demandKg);
      const quality = this.scoringService.qualityScore(row.specs, output.composition as Record<string, number> | null);
      const environmental = this.scoringService.environmentalScore(carbonFactors);
      const logistics = this.scoringService.logisticsScore(distanceKm);
      const economic = this.scoringService.economicScore(output.materialClass ?? 'OTHER', matchedQty, distanceKm);
      const material = Math.max(0, Math.min(100, materialRaw));

      const totalScore = this.scoringService.totalScore(
        { material, quality, environmental, logistics, economic },
        { material: Number(weights.material), quality: Number(weights.quality), environmental: Number(weights.environmental), logistics: Number(weights.logistics), economic: Number(weights.economic) },
      );

      const { co2SavedKg, cbamSavingEur } = this.scoringService.cbam(carbonFactors, matchedQty, carbonPrice);
      const costSavingEur = this.scoringService.costSaving(output.materialClass ?? 'OTHER', matchedQty, distanceKm);

      return {
        inputId: row.id,
        totalScore,
        breakdown: { material: Math.round(material), quality: Math.round(quality), environmental: Math.round(environmental), logistics: Math.round(logistics), economic: Math.round(economic) },
        distanceKm,
        co2SavedKg,
        costSavingEur,
        cbamSavingEur,
        quantityRatio,
        matchedQty,
        counterparty: {
          osbName: row.osb_name,
          sectorLabel: row.sector,
          approximateLocation: row.lat !== null && row.lng !== null ? { lat: Math.round(row.lat * 10) / 10, lng: Math.round(row.lng * 10) / 10 } : null,
        },
      };
    });

    scored.sort((a, b) => b.totalScore - a.totalScore);
    const top = scored.slice(0, topN);
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    const matches = [];
    for (const candidate of top) {
      const match = await this.prisma.match.create({
        data: {
          outputId: output.id,
          inputId: candidate.inputId,
          totalScore: candidate.totalScore,
          breakdown: candidate.breakdown,
          demandQty: candidate.matchedQty,
          co2Saved: candidate.co2SavedKg,
          costSaving: candidate.costSavingEur,
          cbamImpact: candidate.cbamSavingEur,
          status: MatchStatus.PENDING,
          expiresAt,
        },
      });

      matches.push({
        matchId: match.id,
        totalScore: candidate.totalScore,
        breakdown: candidate.breakdown,
        distanceKm: candidate.distanceKm,
        co2Saved: candidate.co2SavedKg,
        costSaving: candidate.costSavingEur,
        cbamImpact: candidate.cbamSavingEur,
        quantityRatio: candidate.quantityRatio,
        partialMatch: candidate.quantityRatio < 0.2,
        counterparty: candidate.counterparty,
        expiresAt: match.expiresAt,
      });
    }

    return { matches, message: null };
  }
}
