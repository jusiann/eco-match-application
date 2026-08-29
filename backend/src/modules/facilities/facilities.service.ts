import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { FastifyRequest } from 'fastify';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateFacilityDto } from './facilities.dto';

const ALLOWED_DOCUMENT_TYPES = ['tax_certificate', 'operating_permit'];
const ALLOWED_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
};
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'facility-documents');

@Injectable()
export class FacilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  private async getFacilityIdForUser(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { facilityId: true } });
    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }
    return user.facilityId;
  }

  async getMe(userId: string) {
    const facilityId = await this.getFacilityIdForUser(userId);

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        taxId: string;
        sector: string;
        osbId: string | null;
        verified: boolean;
        createdAt: Date;
        lat: number | null;
        lng: number | null;
      }>
    >`
      SELECT
        id, name, tax_id AS "taxId", sector, osb_id AS "osbId", verified, created_at AS "createdAt",
        ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
      FROM facilities
      WHERE id = ${facilityId}::uuid
    `;

    const facility = rows[0];
    if (!facility) {
      throw new NotFoundException('Tesis bulunamadı.');
    }

    return {
      success: true,
      facility: {
        id: facility.id,
        name: facility.name,
        taxId: facility.taxId,
        sector: facility.sector,
        osbId: facility.osbId,
        verified: facility.verified,
        location: facility.lat != null && facility.lng != null ? { lat: facility.lat, lng: facility.lng } : null,
        createdAt: facility.createdAt,
      },
    };
  }

  async updateMe(userId: string, dto: UpdateFacilityDto) {
    const facilityId = await this.getFacilityIdForUser(userId);

    if (dto.name || dto.sector) {
      await this.prisma.facility.update({
        where: { id: facilityId },
        data: {
          ...(dto.name ? { name: dto.name.trim() } : {}),
          ...(dto.sector ? { sector: dto.sector.trim() } : {}),
        },
      });
    }

    if (dto.location) {
      // location is Unsupported() in Prisma (geography) — written via raw SQL, K-04
      await this.prisma.$executeRaw`
        UPDATE facilities
        SET location = ST_SetSRID(ST_MakePoint(${dto.location.lng}, ${dto.location.lat}), 4326)::geography,
            updated_at = NOW()
        WHERE id = ${facilityId}::uuid
      `;
    }

    return { success: true, message: 'Tesis bilgileri güncellendi.' };
  }

  async uploadDocument(userId: string, request: FastifyRequest) {
    const facilityId = await this.getFacilityIdForUser(userId);

    const data = await request.file();
    if (!data) {
      throw new BadRequestException({ error: 'VALIDATION_ERROR', message: 'Belge dosyası (file) zorunludur.' });
    }

    const documentTypeField = data.fields?.documentType;
    const documentType =
      documentTypeField && 'value' in documentTypeField ? String((documentTypeField as { value: unknown }).value) : undefined;

    if (!documentType || !ALLOWED_DOCUMENT_TYPES.includes(documentType)) {
      throw new BadRequestException({
        error: 'VALIDATION_ERROR',
        message: `documentType zorunludur ve şunlardan biri olmalıdır: ${ALLOWED_DOCUMENT_TYPES.join(', ')}.`,
      });
    }

    const extension = ALLOWED_MIME_TYPES[data.mimetype];
    if (!extension) {
      throw new BadRequestException({ error: 'VALIDATION_ERROR', message: 'Sadece PDF veya JPG dosyaları kabul edilir.' });
    }

    let buffer: Buffer;
    try {
      buffer = await data.toBuffer();
    } catch {
      throw new BadRequestException({ error: 'VALIDATION_ERROR', message: 'Dosya boyutu 10 MB sınırını aşıyor.' });
    }

    const fileName = `${randomUUID()}.${extension}`;
    await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.promises.writeFile(path.join(UPLOAD_DIR, fileName), Uint8Array.from(buffer));

    const verification = await this.prisma.facilityVerification.create({
      data: {
        facilityId,
        documentType,
        documentUrl: `/uploads/facility-documents/${fileName}`,
      },
    });

    return {
      success: true,
      message: 'Belge yüklendi, inceleme bekleniyor.',
      documentId: verification.id,
      status: verification.status,
    };
  }

  async listDocuments(userId: string) {
    const facilityId = await this.getFacilityIdForUser(userId);

    const [facility, documents] = await Promise.all([
      this.prisma.facility.findUnique({ where: { id: facilityId }, select: { verified: true } }),
      this.prisma.facilityVerification.findMany({
        where: { facilityId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          documentType: true,
          status: true,
          rejectionReason: true,
          createdAt: true,
          reviewedAt: true,
        },
      }),
    ]);

    return {
      success: true,
      verified: facility?.verified ?? false,
      documents,
    };
  }
}
