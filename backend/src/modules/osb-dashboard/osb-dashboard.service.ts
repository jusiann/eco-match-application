import { Injectable, BadRequestException } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import { Workbook } from 'exceljs';
import { MatchStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OsbFacilitiesQueryDto } from './osb-dashboard.dto';

interface CompletedMatchRow {
  id: string;
  co2Saved: number;
  cbamImpact: number;
  createdAt: Date;
  acceptedBySupplierAt: Date | null;
  acceptedByConsumerAt: Date | null;
  outputFacilityId: string;
  inputFacilityId: string;
  materialClass: string | null;
  quantityKg: number;
}

@Injectable()
export class OsbDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // osb_manager rolündeki kullanıcının hangi OSB'yi yönettiği ayrı bir tabloda tutulmuyor --
  // K-02'nin kurduğu "rol = tesis üzerinden" örüntüsüyle aynı: kendi tesisinin osb_id'si.
  private async getManagedOsbId(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { facility: { select: { osbId: true } } },
    });
    if (!user?.facility?.osbId) {
      throw new BadRequestException({
        error: 'OSB_NOT_ASSIGNED',
        message: 'Kullanıcının tesisi bir OSB\'ye bağlı değil.',
      });
    }
    return user.facility.osbId;
  }

  // completed eşleşmelerin "tamamlanma anı" ayrı bir kolon değil -- ikinci tarafın kabul
  // ettiği an (K-23'ün durum makinesi mantığıyla birebir), iki accepted_at'ten geç olanı.
  private effectiveCompletedAt(m: { createdAt: Date; acceptedBySupplierAt: Date | null; acceptedByConsumerAt: Date | null }): Date {
    const candidates = [m.acceptedBySupplierAt, m.acceptedByConsumerAt].filter((d): d is Date => d !== null);
    return candidates.length ? new Date(Math.max(...candidates.map((d) => d.getTime()))) : m.createdAt;
  }

  private async loadCompletedMatches(osbId: string): Promise<CompletedMatchRow[]> {
    const rows = await this.prisma.match.findMany({
      where: {
        status: MatchStatus.COMPLETED,
        OR: [{ output: { facility: { osbId } } }, { input: { facility: { osbId } } }],
      },
      select: {
        id: true,
        co2Saved: true,
        cbamImpact: true,
        createdAt: true,
        acceptedBySupplierAt: true,
        acceptedByConsumerAt: true,
        demandQty: true,
        output: { select: { facilityId: true, materialClass: true } },
        input: { select: { facilityId: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      co2Saved: Number(r.co2Saved ?? 0),
      cbamImpact: Number(r.cbamImpact ?? 0),
      createdAt: r.createdAt!,
      acceptedBySupplierAt: r.acceptedBySupplierAt,
      acceptedByConsumerAt: r.acceptedByConsumerAt,
      outputFacilityId: r.output.facilityId,
      inputFacilityId: r.input.facilityId,
      materialClass: r.output.materialClass,
      quantityKg: Number(r.demandQty ?? 0),
    }));
  }

  async stats(userId: string) {
    const osbId = await this.getManagedOsbId(userId);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalFacilities, completed, allTerminal] = await Promise.all([
      this.prisma.facility.count({ where: { osbId, verified: true } }),
      this.loadCompletedMatches(osbId),
      this.prisma.match.count({
        where: {
          status: { in: [MatchStatus.COMPLETED, MatchStatus.REJECTED, MatchStatus.EXPIRED] },
          OR: [{ output: { facility: { osbId } } }, { input: { facility: { osbId } } }],
        },
      }),
    ]);

    const completedThisMonth = completed.filter((m) => this.effectiveCompletedAt(m) >= monthStart);
    const activeMatchesLast30d = completed.filter((m) => this.effectiveCompletedAt(m) >= thirtyDaysAgo).length;

    // Simbiyoz oranının paydası pending İÇERMEZ (docs/05) -- allTerminal zaten sadece
    // completed+rejected+expired'ı sayıyor.
    const symbiosisRate = allTerminal > 0 ? completed.length / allTerminal : 0;

    const durationRows = await this.prisma.match.findMany({
      where: {
        acceptedByConsumerAt: { not: null },
        OR: [{ output: { facility: { osbId } } }, { input: { facility: { osbId } } }],
      },
      select: { createdAt: true, acceptedByConsumerAt: true },
    });
    const avgMatchDurationHours =
      durationRows.length > 0
        ? durationRows.reduce((sum, r) => sum + (r.acceptedByConsumerAt!.getTime() - r.createdAt!.getTime()), 0) /
          durationRows.length /
          (1000 * 60 * 60)
        : null;

    return {
      totalFacilities,
      activeMatchesLast30d,
      monthlyCo2SavedKg: Math.round(completedThisMonth.reduce((sum, m) => sum + m.co2Saved, 0)),
      monthlyCbamSavingEur: Math.round(completedThisMonth.reduce((sum, m) => sum + m.cbamImpact, 0)),
      symbiosisRate: Number(symbiosisRate.toFixed(3)),
      avgMatchDurationHours: avgMatchDurationHours !== null ? Number(avgMatchDurationHours.toFixed(1)) : null,
    };
  }

  async facilities(userId: string, query: OsbFacilitiesQueryDto) {
    const osbId = await this.getManagedOsbId(userId);
    const rows = await this.prisma.facility.findMany({
      where: { osbId, ...(query.sector ? { sector: query.sector } : {}) },
      select: { id: true, name: true, sector: true, verified: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
    return { data: rows };
  }

  async map(userId: string) {
    const osbId = await this.getManagedOsbId(userId);

    const pins = await this.prisma.$queryRaw<
      Array<{ id: string; name: string; sector: string; lat: number | null; lng: number | null }>
    >`
      SELECT f.id, f.name, f.sector, ST_Y(f.location::geometry) AS lat, ST_X(f.location::geometry) AS lng
      FROM facilities f WHERE f.osb_id = ${osbId}::uuid
    `;

    const completed = await this.loadCompletedMatches(osbId);
    const facilityIds = new Set(completed.flatMap((m) => [m.outputFacilityId, m.inputFacilityId]));
    const linePoints =
      facilityIds.size > 0
        ? await this.prisma.$queryRaw<Array<{ id: string; lat: number | null; lng: number | null }>>`
            SELECT f.id, ST_Y(f.location::geometry) AS lat, ST_X(f.location::geometry) AS lng
            FROM facilities f WHERE f.id = ANY(${Array.from(facilityIds)}::uuid[])
          `
        : [];
    const coordsById = new Map(linePoints.map((p) => [p.id, { lat: p.lat, lng: p.lng }]));

    return {
      pins: pins.map((p) => ({ id: p.id, name: p.name, sector: p.sector, lat: p.lat, lng: p.lng })),
      matchLines: completed.map((m) => ({
        matchId: m.id,
        from: coordsById.get(m.outputFacilityId) ?? null,
        to: coordsById.get(m.inputFacilityId) ?? null,
      })),
    };
  }

  private parsePeriod(period: string): { start: Date; end: Date; label: string } {
    const [yearStr, monthStr] = period.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr) - 1;
    return { start: new Date(year, month, 1), end: new Date(year, month + 1, 1), label: period };
  }

  async monthlyReport(userId: string, period: string, format?: string) {
    const osbId = await this.getManagedOsbId(userId);
    const osb = await this.prisma.osb.findUnique({ where: { id: osbId }, select: { name: true, city: true } });
    const { start, end, label } = this.parsePeriod(period);

    const completed = await this.loadCompletedMatches(osbId);
    const inPeriod = completed.filter((m) => {
      const at = this.effectiveCompletedAt(m);
      return at >= start && at < end;
    });

    // AD4: "sektör bazında en çok atık üreten" -- dönem içinde tamamlanan eşleşmelerde
    // tedarikçi (output) tarafı olarak en çok miktar taşıyan 10 tesis.
    const wasteBySupplier = new Map<string, number>();
    const dealsByBuyer = new Map<string, number>();
    for (const m of inPeriod) {
      wasteBySupplier.set(m.outputFacilityId, (wasteBySupplier.get(m.outputFacilityId) ?? 0) + m.quantityKg);
      dealsByBuyer.set(m.inputFacilityId, (dealsByBuyer.get(m.inputFacilityId) ?? 0) + 1);
    }
    const facilityIds = new Set([...wasteBySupplier.keys(), ...dealsByBuyer.keys()]);
    const facilityNames = facilityIds.size
      ? await this.prisma.facility.findMany({ where: { id: { in: Array.from(facilityIds) } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(facilityNames.map((f) => [f.id, f.name]));

    const topWasteProducers = [...wasteBySupplier.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([facilityId, quantityKg]) => ({ facilityId, name: nameById.get(facilityId) ?? facilityId, quantityKg: Math.round(quantityKg) }));
    const topActiveBuyers = [...dealsByBuyer.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([facilityId, dealCount]) => ({ facilityId, name: nameById.get(facilityId) ?? facilityId, dealCount }));

    const summary = {
      period: label,
      osb: osb?.name ?? osbId,
      completedMatches: inPeriod.length,
      totalCo2SavedKg: Math.round(inPeriod.reduce((sum, m) => sum + m.co2Saved, 0)),
      totalCbamSavingEur: Math.round(inPeriod.reduce((sum, m) => sum + m.cbamImpact, 0)),
      topWasteProducers,
      topActiveBuyers,
    };

    if (format === 'xlsx') {
      return { summary, xlsxBuffer: await this.buildXlsx(summary) };
    }
    if (format === 'pdf') {
      return { summary, pdfBuffer: await this.buildPdf(summary) };
    }
    return { summary };
  }

  private async buildPdf(summary: {
    period: string;
    osb: string;
    completedMatches: number;
    totalCo2SavedKg: number;
    totalCbamSavingEur: number;
    topWasteProducers: Array<{ name: string; quantityKg: number }>;
    topActiveBuyers: Array<{ name: string; dealCount: number }>;
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = doc as unknown as NodeJS.ReadableStream;
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks.map((c) => Uint8Array.from(c)))));
      stream.on('error', reject);

      doc.fontSize(18).text(`${summary.osb} — Aylık Rapor (${summary.period})`, { align: 'center' });
      doc.moveDown();
      doc.fontSize(11);
      doc.text(`Tamamlanan eşleşme: ${summary.completedMatches}`);
      doc.text(`Toplam CO2 tasarrufu: ${summary.totalCo2SavedKg} kg`);
      doc.text(`Toplam CBAM tasarrufu: ${summary.totalCbamSavingEur} EUR`);
      doc.moveDown();
      doc.fontSize(13).text('En çok atık üreten 10 tesis');
      doc.fontSize(10);
      summary.topWasteProducers.forEach((f, i) => doc.text(`${i + 1}. ${f.name} — ${f.quantityKg} kg`));
      doc.moveDown();
      doc.fontSize(13).text('En aktif 10 alıcı tesis');
      doc.fontSize(10);
      summary.topActiveBuyers.forEach((f, i) => doc.text(`${i + 1}. ${f.name} — ${f.dealCount} eşleşme`));
      doc.end();
    });
  }

  private async buildXlsx(summary: {
    period: string;
    osb: string;
    completedMatches: number;
    totalCo2SavedKg: number;
    totalCbamSavingEur: number;
    topWasteProducers: Array<{ name: string; quantityKg: number }>;
    topActiveBuyers: Array<{ name: string; dealCount: number }>;
  }): Promise<Buffer> {
    const workbook = new Workbook();

    const summarySheet = workbook.addWorksheet('Özet');
    summarySheet.addRow(['OSB', summary.osb]);
    summarySheet.addRow(['Dönem', summary.period]);
    summarySheet.addRow(['Tamamlanan eşleşme', summary.completedMatches]);
    summarySheet.addRow(['Toplam CO2 tasarrufu (kg)', summary.totalCo2SavedKg]);
    summarySheet.addRow(['Toplam CBAM tasarrufu (EUR)', summary.totalCbamSavingEur]);

    const producersSheet = workbook.addWorksheet('En Çok Atık Üreten');
    producersSheet.addRow(['Tesis', 'Miktar (kg)']);
    summary.topWasteProducers.forEach((f) => producersSheet.addRow([f.name, f.quantityKg]));

    const buyersSheet = workbook.addWorksheet('En Aktif Alıcı');
    buyersSheet.addRow(['Tesis', 'Eşleşme sayısı']);
    summary.topActiveBuyers.forEach((f) => buyersSheet.addRow([f.name, f.dealCount]));

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
}
