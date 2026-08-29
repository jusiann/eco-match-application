import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MaterialClass, MatchStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DppService } from './dpp.service';
import { CreateOutputDto, UpdateOutputDto, CreateInputDto, UpdateInputDto, ListQueryDto } from './materials.dto';

@Injectable()
export class MaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dppService: DppService,
  ) {}

  private async getFacilityWithLocation(facilityId: string) {
    const facility = await this.prisma.facility.findUnique({
      where: { id: facilityId },
      include: { osb: { select: { name: true } } },
    });
    if (!facility) {
      throw new NotFoundException('Tesis bulunamadı.');
    }

    const rows = await this.prisma.$queryRaw<Array<{ lat: number | null; lng: number | null }>>`
      SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
      FROM facilities WHERE id = ${facilityId}::uuid
    `;
    const loc = rows[0];

    return {
      ...facility,
      location: loc?.lat != null && loc?.lng != null ? { lat: loc.lat, lng: loc.lng } : null,
      osbName: facility.osb?.name ?? null,
    };
  }

  private async getFacilityIdForUser(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { facilityId: true } });
    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }
    return user.facilityId;
  }

  private paginate(query: ListQueryDto) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const page = Math.max(query.page ?? 1, 1);
    const skip = (page - 1) * limit;
    return { skip, take: limit, page, limit };
  }

  // ── Outputs ──

  private async getOwnedOutput(id: string, facilityId: string) {
    const output = await this.prisma.output.findUnique({ where: { id } });
    if (!output || output.facilityId !== facilityId) {
      throw new NotFoundException('Çıktı bulunamadı.');
    }
    return output;
  }

  async createOutput(userId: string, dto: CreateOutputDto) {
    const facilityId = await this.getFacilityIdForUser(userId);

    const output = await this.prisma.output.create({
      data: {
        facilityId,
        description: dto.description.trim(),
        materialClass: dto.materialClass ? (dto.materialClass.toUpperCase() as MaterialClass) : null,
        composition: dto.composition ?? undefined,
        quantityKg: dto.quantityKg,
        stock: dto.stock ?? dto.quantityKg,
        frequency: dto.frequency,
        pendingReview: !dto.materialClass,
        embeddingPending: true,
      },
    });

    // Embedding üretimi Faz 1.4-1.5'te eklenecek (AiClient/EmbeddingsService henüz yok) --
    // embeddingPending bu yüzden her zaman true. DPP ise (Faz 1.6) burada senkron üretiliyor,
    // S2 akışının performans hedefi de (form submit -> 201, PDF üretimi dahil) bunu varsayıyor.
    const facility = await this.getFacilityWithLocation(facilityId);
    const compliance = this.dppService.checkCompliance(output, facility);
    const passportData: any = this.dppService.buildPassportData(output, facility, compliance);

    const passportId = randomUUID();
    const signature = this.dppService.sign(passportId);
    const qrCode = this.dppService.buildQrUrl(passportId, signature);
    const pdfUrl = this.dppService.buildPdfUrl(passportId, signature);
    passportData.passport_id = passportId;
    passportData.signature.value = signature;

    const pdfBuffer = await this.dppService.generatePdf(passportData);
    await this.dppService.savePdf(passportId, pdfBuffer);

    await this.prisma.materialPassport.create({
      data: {
        id: passportId,
        outputId: output.id,
        passportData: passportData as Prisma.InputJsonValue,
        dppCompliant: compliance.compliant,
        qrCode,
        pdfUrl,
      },
    });

    return {
      outputId: output.id,
      passportId,
      qrCode,
      pdfUrl,
      embeddingPending: output.embeddingPending,
      pendingReview: output.pendingReview,
    };
  }

  async listOutputs(userId: string, query: ListQueryDto) {
    const facilityId = await this.getFacilityIdForUser(userId);
    const { skip, take, page, limit } = this.paginate(query);

    const [data, total] = await Promise.all([
      this.prisma.output.findMany({ where: { facilityId }, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.output.count({ where: { facilityId } }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) } };
  }

  async getOutput(userId: string, id: string) {
    const facilityId = await this.getFacilityIdForUser(userId);
    return this.getOwnedOutput(id, facilityId);
  }

  async updateOutput(userId: string, id: string, dto: UpdateOutputDto) {
    const facilityId = await this.getFacilityIdForUser(userId);
    await this.getOwnedOutput(id, facilityId);

    const data: Prisma.OutputUpdateInput = {};
    if (dto.description !== undefined) data.description = dto.description.trim();
    if (dto.materialClass !== undefined) {
      data.materialClass = dto.materialClass.toUpperCase() as MaterialClass;
      data.pendingReview = false;
    }
    if (dto.composition !== undefined) data.composition = dto.composition;
    if (dto.quantityKg !== undefined) data.quantityKg = dto.quantityKg;
    if (dto.stock !== undefined) data.stock = dto.stock;
    if (dto.frequency !== undefined) data.frequency = dto.frequency;

    if (Object.keys(data).length > 0) {
      data.embeddingPending = true; // metin değişmiş olabilir, embedding yeniden hesaplanmalı (Faz 1.5)
      await this.prisma.output.update({ where: { id }, data });
    }

    return { success: true, message: 'Çıktı güncellendi.' };
  }

  async deleteOutput(userId: string, id: string) {
    const facilityId = await this.getFacilityIdForUser(userId);
    await this.getOwnedOutput(id, facilityId);

    const activeMatch = await this.prisma.match.findFirst({
      where: { outputId: id, status: { in: [MatchStatus.PENDING, MatchStatus.ACCEPTED] } },
    });
    if (activeMatch) {
      throw new ConflictException({
        error: 'CONFLICT',
        message: 'Bu çıktıya bağlı aktif bir eşleşme olduğu için silinemez.',
      });
    }

    await this.prisma.output.delete({ where: { id } });
    return { success: true, message: 'Çıktı silindi.' };
  }

  // ── Inputs ──

  private async getOwnedInput(id: string, facilityId: string) {
    const input = await this.prisma.input.findUnique({ where: { id } });
    if (!input || input.facilityId !== facilityId) {
      throw new NotFoundException('Girdi bulunamadı.');
    }
    return input;
  }

  async createInput(userId: string, dto: CreateInputDto) {
    const facilityId = await this.getFacilityIdForUser(userId);

    const input = await this.prisma.input.create({
      data: {
        facilityId,
        description: dto.description.trim(),
        materialClass: dto.materialClass ? (dto.materialClass.toUpperCase() as MaterialClass) : null,
        specs: (dto.specs as Prisma.InputJsonValue) ?? undefined,
        quantityKg: dto.quantityKg,
        frequency: dto.frequency,
        pendingReview: !dto.materialClass,
        embeddingPending: true,
      },
    });

    return {
      inputId: input.id,
      embeddingPending: input.embeddingPending,
      pendingReview: input.pendingReview,
    };
  }

  async listInputs(userId: string, query: ListQueryDto) {
    const facilityId = await this.getFacilityIdForUser(userId);
    const { skip, take, page, limit } = this.paginate(query);

    const [data, total] = await Promise.all([
      this.prisma.input.findMany({ where: { facilityId }, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.input.count({ where: { facilityId } }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) } };
  }

  async updateInput(userId: string, id: string, dto: UpdateInputDto) {
    const facilityId = await this.getFacilityIdForUser(userId);
    await this.getOwnedInput(id, facilityId);

    const data: Prisma.InputUpdateInput = {};
    if (dto.description !== undefined) data.description = dto.description.trim();
    if (dto.materialClass !== undefined) {
      data.materialClass = dto.materialClass.toUpperCase() as MaterialClass;
      data.pendingReview = false;
    }
    if (dto.specs !== undefined) data.specs = dto.specs as Prisma.InputJsonValue;
    if (dto.quantityKg !== undefined) data.quantityKg = dto.quantityKg;
    if (dto.frequency !== undefined) data.frequency = dto.frequency;

    if (Object.keys(data).length > 0) {
      data.embeddingPending = true;
      await this.prisma.input.update({ where: { id }, data });
    }

    return { success: true, message: 'Girdi güncellendi.' };
  }

  async deleteInput(userId: string, id: string) {
    const facilityId = await this.getFacilityIdForUser(userId);
    await this.getOwnedInput(id, facilityId);

    // Not: outputs'un aksine, docs/04'te inputs silmede aktif eşleşme kısıtı belgelenmedi.
    // Match.input FK'sı ON DELETE CASCADE (005_matching.sql) — bilinçli tasarım, burada tekrar edilmiyor.
    await this.prisma.input.delete({ where: { id } });
    return { success: true, message: 'Girdi silindi.' };
  }

  // ── DPP (public, imza doğrulamalı) ──

  private async getPassportOrThrow(id: string) {
    const passport = await this.prisma.materialPassport.findUnique({ where: { id } });
    if (!passport) {
      throw new NotFoundException('Pasaport bulunamadı.');
    }
    return passport;
  }

  private assertValidSignature(id: string, sig: string | undefined) {
    if (!this.dppService.verify(id, sig)) {
      throw new ForbiddenException({ error: 'INVALID_SIGNATURE', message: 'Geçersiz veya eksik imza.' });
    }
  }

  async getPassportJson(id: string, sig: string | undefined) {
    this.assertValidSignature(id, sig);
    const passport = await this.getPassportOrThrow(id);
    return passport.passportData;
  }

  async getPassportPdf(id: string, sig: string | undefined) {
    this.assertValidSignature(id, sig);
    await this.getPassportOrThrow(id);
    const buffer = await this.dppService.readPdf(id);
    if (!buffer) {
      throw new NotFoundException('PDF dosyası bulunamadı.');
    }
    return buffer;
  }

  async getPassportQrPng(userId: string, id: string) {
    const facilityId = await this.getFacilityIdForUser(userId);
    const passport = await this.prisma.materialPassport.findUnique({ where: { id }, include: { output: true } });
    if (!passport || passport.output.facilityId !== facilityId) {
      throw new NotFoundException('Pasaport bulunamadı.');
    }
    if (!passport.qrCode) {
      throw new NotFoundException('QR kodu henüz üretilmedi.');
    }
    return this.dppService.generateQrPng(passport.qrCode);
  }
}
