import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import { Output, Facility } from '@prisma/client';

const PDF_DIR = path.join(process.cwd(), 'uploads', 'dpp-pdfs');

export interface EsprCheckResult {
  compliant: boolean;
  issues: string[];
}

// `location` is Unsupported() in schema.prisma so Prisma's generated Facility type omits it
// entirely -- callers read it via a raw ST_X/ST_Y query and pass it in alongside the model.
export type FacilityWithLocation = Facility & {
  location: { lat: number; lng: number } | null;
  osbName: string | null;
};

@Injectable()
export class DppService {
  constructor(private readonly configService: ConfigService) {}

  private baseUrl(): string {
    return this.configService.get<string>('PUBLIC_BASE_URL') ?? 'http://localhost:3000';
  }

  // HMAC secret is deliberately the same as JWT_SECRET_KEY (K-21) -- both are "backend-only
  // secret used to prove a value was issued by us", a separate DPP key is not worth the
  // extra required env var for this deploy target.
  private secret(): string {
    return this.configService.get<string>('JWT_SECRET_KEY') as string;
  }

  sign(passportId: string): string {
    return createHmac('sha256', this.secret()).update(passportId).digest('hex');
  }

  verify(passportId: string, signature: string | undefined): boolean {
    if (!signature) return false;
    const expected = Buffer.from(this.sign(passportId), 'hex');
    const candidate = Buffer.from(signature, 'hex');
    return expected.length === candidate.length && timingSafeEqual(Uint8Array.from(expected), Uint8Array.from(candidate));
  }

  // Docs/05: dpp_compliant = true sadece şu dördü de geçerse
  checkCompliance(output: Output, facility: FacilityWithLocation): EsprCheckResult {
    const issues: string[] = [];

    const composition = output.composition as Record<string, number> | null;
    if (!composition || Object.keys(composition).length === 0) {
      issues.push('composition_sum_invalid');
    } else {
      const sum = Object.values(composition).reduce((acc, v) => acc + Number(v), 0);
      if (Math.abs(sum - 100) > 0.5) issues.push('composition_sum_invalid');
    }

    if (!output.materialClass) issues.push('material_class_missing');
    if (!facility.location) issues.push('issuer_location_missing');
    if (!output.createdAt) issues.push('production_date_missing');

    return { compliant: issues.length === 0, issues };
  }

  buildPassportData(output: Output, facility: FacilityWithLocation, compliance: EsprCheckResult) {
    const productionDate = (output.createdAt ?? new Date()).toISOString().slice(0, 10);

    return {
      dpp_version: '1.0',
      passport_id: null as string | null, // create sonrası doldurulur (id henüz yok)
      product_id: `${output.id.slice(0, 8).toUpperCase()}-${productionDate.slice(0, 7)}`,
      issuer: {
        facility_name: facility.name,
        tax_id: facility.taxId,
        location: facility.location
          ? { lat: facility.location.lat, lng: facility.location.lng, osb: facility.osbName }
          : null,
      },
      material: {
        class: output.materialClass,
        description: output.description,
        composition: output.composition,
        quantity_kg: Number(output.quantityKg),
        hazardous: false, // şemada henüz bu bilgi yok -- varsayılan false, K-21
      },
      // physical_properties: şemada state/moisture/density kolonları yok, bu yüzden hiç
      // eklenmiyor -- ileride outputs'a JSONB kolon eklenirse doldurulabilir
      origin: {
        process: null,
        production_date: productionDate,
        batch: null,
      },
      // environmental_impact: CBAMCalculator (Faz 1.9) bir eşleşmeye bağlı çalışıyor,
      // bağımsız bir output'ta henüz hesaplanamıyor -- bilinçli olarak eklenmedi
      traceability: {
        created_at: output.createdAt,
        updated_at: output.createdAt,
        chain_of_custody: [],
      },
      compliance: {
        espr_compliant: compliance.compliant,
        cbam_ready: false,
        issues: compliance.issues,
        certifications: [],
      },
      signature: { algorithm: 'HMAC-SHA256', value: null as string | null },
    };
  }

  async generatePdf(passportData: Record<string, unknown>): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = doc as unknown as NodeJS.ReadableStream;
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks.map((c) => Uint8Array.from(c)))));
      stream.on('error', reject);

      const issuer = passportData.issuer as any;
      const material = passportData.material as any;
      const compliance = passportData.compliance as any;

      doc.fontSize(18).text('Dijital Ürün Pasaportu (DPP)', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Pasaport ID: ${passportData.passport_id}`);
      doc.text(`Ürün ID: ${passportData.product_id}`);
      doc.moveDown();
      doc.fontSize(12).text('Üretici', { underline: true });
      doc.fontSize(10).text(`Tesis: ${issuer.facility_name}`);
      doc.text(`Vergi No: ${issuer.tax_id}`);
      doc.moveDown();
      doc.fontSize(12).text('Malzeme', { underline: true });
      doc.fontSize(10).text(`Sınıf: ${material.class ?? '-'}`);
      doc.text(`Açıklama: ${material.description}`);
      doc.text(`Miktar: ${material.quantity_kg} kg`);
      doc.moveDown();
      doc.fontSize(12).text('Uygunluk', { underline: true });
      doc.fontSize(10).fillColor(compliance.espr_compliant ? 'green' : 'red');
      doc.text(`ESPR uyumlu: ${compliance.espr_compliant ? 'Evet' : 'Hayır'}`);
      if (compliance.issues.length > 0) {
        doc.text(`Sorunlar: ${compliance.issues.join(', ')}`);
      }
      doc.fillColor('black');

      doc.end();
    });
  }

  async savePdf(passportId: string, buffer: Buffer): Promise<string> {
    await fs.promises.mkdir(PDF_DIR, { recursive: true });
    const fileName = `${passportId}.pdf`;
    await fs.promises.writeFile(path.join(PDF_DIR, fileName), Uint8Array.from(buffer));
    return `/v1/materials/passport/${passportId}/pdf`;
  }

  async readPdf(passportId: string): Promise<Buffer | null> {
    try {
      return await fs.promises.readFile(path.join(PDF_DIR, `${passportId}.pdf`));
    } catch {
      return null;
    }
  }

  buildQrUrl(passportId: string, signature: string): string {
    return `${this.baseUrl()}/dpp/${passportId}?sig=${signature}`;
  }

  buildPdfUrl(passportId: string, signature: string): string {
    return `${this.baseUrl()}/v1/materials/passport/${passportId}/pdf?sig=${signature}`;
  }

  async generateQrPng(url: string): Promise<Buffer> {
    return QRCode.toBuffer(url, { type: 'png', width: 300, margin: 2 });
  }
}
