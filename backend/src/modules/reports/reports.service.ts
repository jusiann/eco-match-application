import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import { Prisma, ReportType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ScoringService, CarbonFactors } from '../matchmaking/scoring.service';
import { ListReportsQueryDto } from './reports.dto';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringService: ScoringService,
  ) {}

  private async getFacilityIdForUser(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { facilityId: true } });
    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }
    return user.facilityId;
  }

  private async getMatchForParty(userId: string, matchId: string) {
    const facilityId = await this.getFacilityIdForUser(userId);
    const match = await this.prisma.match.findUnique({ where: { id: matchId }, include: { output: true, input: true } });
    if (!match || (match.output.facilityId !== facilityId && match.input.facilityId !== facilityId)) {
      throw new NotFoundException('Eşleşme bulunamadı.');
    }
    return match;
  }

  private async getCarbonFactors(materialClass: string | null): Promise<CarbonFactors & { source: string | null }> {
    if (!materialClass) {
      return { virgin: 0, secondary: 0, source: null };
    }
    const now = new Date();
    const rows = await this.prisma.carbonFactor.findMany({
      where: { materialClass: materialClass as never, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
    });
    const virginRow = rows.find((r) => r.factorType === 'virgin');
    const secondaryRow = rows.find((r) => r.factorType === 'secondary');
    return {
      virgin: Number(virginRow?.co2PerKg ?? 0),
      secondary: Number(secondaryRow?.co2PerKg ?? 0),
      source: virginRow?.source ?? secondaryRow?.source ?? null,
    };
  }

  // AD3: rapor üretildiği andaki faktörlerle donar -- her çağrı yeni bir Report satırı
  // açar, eskisi asla üzerine yazılmaz.
  async generateEnvironmental(userId: string, matchId: string, format: 'json' | 'pdf') {
    const match = await this.getMatchForParty(userId, matchId);
    const factors = await this.getCarbonFactors(match.output.materialClass);

    const data = {
      report_type: 'environmental',
      match_id: match.id,
      generated_at: new Date().toISOString(),
      material_class: match.output.materialClass,
      matched_quantity_kg: Number(match.demandQty ?? 0),
      virgin_factor_co2_per_kg: factors.virgin,
      secondary_factor_co2_per_kg: factors.secondary,
      co2_saved_kg: Number(match.co2Saved ?? 0),
      environmental_score_percent: Math.round(this.scoringService.environmentalScore(factors)),
      factor_source: factors.source,
    };

    await this.prisma.report.create({
      data: { matchId: match.id, reportType: ReportType.ENVIRONMENTAL, data: data as Prisma.InputJsonValue },
    });

    if (format === 'pdf') {
      return { data, pdfBuffer: await this.buildPdf('Çevresel Etki Raporu', data) };
    }
    return { data };
  }

  async generateCbam(userId: string, matchId: string, format: 'json' | 'pdf') {
    const match = await this.getMatchForParty(userId, matchId);
    if (match.status !== 'COMPLETED') {
      throw new ForbiddenException({ error: 'REPORT_NOT_AVAILABLE', message: 'CBAM raporu sadece tamamlanmış eşleşmeler için üretilebilir.' });
    }

    const factors = await this.getCarbonFactors(match.output.materialClass);
    const carbonPriceEurPerTon = 85; // docs/05 sabiti

    const data = {
      report_type: 'cbam',
      match_id: match.id,
      generated_at: new Date().toISOString(),
      material_class: match.output.materialClass,
      matched_quantity_kg: Number(match.demandQty ?? 0),
      virgin_factor_co2_per_kg: factors.virgin,
      secondary_factor_co2_per_kg: factors.secondary,
      net_reduction_co2_per_kg: factors.virgin - factors.secondary,
      total_co2_saved_kg: Number(match.co2Saved ?? 0),
      carbon_price_eur_per_ton: carbonPriceEurPerTon,
      cbam_saving_eur: Number(match.cbamImpact ?? 0),
      factor_source: factors.source,
    };

    await this.prisma.report.create({
      data: { matchId: match.id, reportType: ReportType.CBAM, data: data as Prisma.InputJsonValue },
    });

    if (format === 'pdf') {
      return { data, pdfBuffer: await this.buildPdf('CBAM Etki Raporu', data) };
    }
    return { data };
  }

  // Not: `reports.match_id` şemada NOT NULL -- bir DPP pasaportu bir eşleşmeye değil bir
  // çıktıya bağlı olduğu için `reports` tablosuna satır AÇILAMIYOR (K-27). Bu yüzden bu
  // endpoint sadece pasaport verisini sahip kimlik doğrulamasıyla döndürüyor; imzalı public
  // muadili GET /v1/materials/passport/:id/json.
  async getDppReport(userId: string, passportId: string) {
    const facilityId = await this.getFacilityIdForUser(userId);
    const passport = await this.prisma.materialPassport.findUnique({ where: { id: passportId }, include: { output: true } });
    if (!passport || passport.output.facilityId !== facilityId) {
      throw new NotFoundException('Pasaport bulunamadı.');
    }
    return passport.passportData;
  }

  async list(userId: string, query: ListReportsQueryDto) {
    const facilityId = await this.getFacilityIdForUser(userId);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const page = Math.max(query.page ?? 1, 1);
    const skip = (page - 1) * limit;

    const where: Prisma.ReportWhereInput = { match: { OR: [{ output: { facilityId } }, { input: { facilityId } }] } };

    const [data, total] = await Promise.all([
      this.prisma.report.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      this.prisma.report.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) } };
  }

  private async buildPdf(title: string, data: Record<string, unknown>): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = doc as unknown as NodeJS.ReadableStream;
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks.map((c) => Uint8Array.from(c)))));
      stream.on('error', reject);

      doc.fontSize(18).text(title, { align: 'center' });
      doc.moveDown();
      doc.fontSize(10);
      for (const [key, value] of Object.entries(data)) {
        doc.text(`${key}: ${value}`);
      }
      doc.end();
    });
  }
}
