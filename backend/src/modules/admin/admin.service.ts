import { Injectable, NotFoundException, BadRequestException, ConflictException, UnprocessableEntityException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { ReviewStatus, UserRole, MaterialClass, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateCarbonFactorDto,
  CreateUserDto,
  UpdateUserDto,
  ListQueryDto,
  AuditLogQueryDto,
  UpdateConfigBody,
  CreateWeightsDto,
  CreateApiKeyDto,
} from './admin.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  private paginate(query: ListQueryDto) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const page = Math.max(query.page ?? 1, 1);
    return { skip: (page - 1) * limit, take: limit, page, limit };
  }

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

  // ── Carbon Factors (Faz 2.9) ──

  listCarbonFactors() {
    return this.prisma.carbonFactor.findMany({ orderBy: [{ materialClass: 'asc' }, { factorType: 'asc' }, { validFrom: 'desc' }] });
  }

  // docs/04: yeni kayıt eklenince eskinin valid_to'sunu kapatır (retroaktiflik yok, AD3)
  async createCarbonFactor(dto: CreateCarbonFactorDto) {
    const materialClass = dto.materialClass.toUpperCase() as MaterialClass;
    const validFrom = dto.validFrom ? new Date(dto.validFrom) : new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.carbonFactor.updateMany({
        where: { materialClass, factorType: dto.factorType, validTo: null },
        data: { validTo: validFrom },
      });
      await tx.carbonFactor.create({
        data: { materialClass, factorType: dto.factorType, co2PerKg: dto.co2PerKg, source: dto.source, validFrom },
      });
    });

    return { success: true, message: 'Karbon faktörü eklendi.' };
  }

  // ── Users (numarasız -- roadmap'e eklenmeli, bkz. 08-yol-haritasi.md) ──

  async listUsers(query: ListQueryDto) {
    const { skip, take, page, limit } = this.paginate(query);
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, role: true, contactName: true, phone: true, emailVerified: true, facilityId: true, createdAt: true },
      }),
      this.prisma.user.count(),
    ]);
    return { data, meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) } };
  }

  async createUser(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) {
      throw new ConflictException({ error: 'EMAIL_ALREADY_EXISTS', message: 'Bu e-posta adresiyle zaten bir kullanıcı var.' });
    }
    const facility = await this.prisma.facility.findUnique({ where: { id: dto.facilityId } });
    if (!facility) {
      throw new BadRequestException('Belirtilen tesis bulunamadı.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        role: dto.role as UserRole,
        facilityId: dto.facilityId,
        contactName: dto.contactName,
        phone: dto.phone,
        emailVerified: true, // admin eliyle açılan hesap -- e-posta doğrulama akışına girmiyor
      },
    });

    return { success: true, userId: user.id, message: 'Kullanıcı oluşturuldu.' };
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.role ? { role: dto.role as UserRole } : {}),
        ...(dto.contactName !== undefined ? { contactName: dto.contactName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      },
    });

    return { success: true, message: 'Kullanıcı güncellendi.' };
  }

  // ── System Config (numarasız) ──

  async getConfig() {
    const rows = await this.prisma.systemConfig.findMany({ orderBy: { key: 'asc' } });
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  async updateConfig(updaterId: string, body: UpdateConfigBody) {
    const entries = Object.entries(body ?? {});
    if (entries.length === 0) {
      throw new BadRequestException({ error: 'VALIDATION_ERROR', message: 'Güncellenecek en az bir anahtar gönderilmelidir.' });
    }

    for (const [key] of entries) {
      const existing = await this.prisma.systemConfig.findUnique({ where: { key } });
      if (!existing) {
        throw new BadRequestException({ error: 'VALIDATION_ERROR', message: `Bilinmeyen system_config anahtarı: ${key}` });
      }
    }

    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.systemConfig.update({
          where: { key },
          data: { value: value as Prisma.InputJsonValue, updatedBy: updaterId },
        }),
      ),
    );

    return { success: true, message: 'Yapılandırma güncellendi.' };
  }

  // ── AHP Ağırlıkları (Faz 3.5, AD2) ──

  listWeights() {
    return this.prisma.weightsConfig.findMany({ orderBy: { version: 'desc' } });
  }

  async createWeights(dto: CreateWeightsDto) {
    const sum = dto.material + dto.quality + dto.environmental + dto.logistics + dto.economic;
    const rounded = Number(sum.toFixed(3));
    if (rounded !== 1) {
      throw new UnprocessableEntityException({
        error: 'WEIGHTS_SUM_INVALID',
        message: `Toplam ağırlık 1.000 olmalı (şu an ${rounded.toFixed(3)})`,
      });
    }

    const last = await this.prisma.weightsConfig.findFirst({ orderBy: { version: 'desc' }, select: { version: true } });
    const version = (last?.version ?? 0) + 1;

    // Yeni versiyon oluşturulduğunda OTOMATİK aktifleşmiyor (docs/04) -- ayrı bir
    // POST .../activate çağrısı gerekiyor.
    const created = await this.prisma.weightsConfig.create({
      data: {
        version,
        material: dto.material,
        quality: dto.quality,
        environmental: dto.environmental,
        logistics: dto.logistics,
        economic: dto.economic,
        active: false,
      },
    });

    return { success: true, weightsId: created.id, version, message: 'Yeni ağırlık versiyonu oluşturuldu.' };
  }

  async activateWeights(id: string) {
    const target = await this.prisma.weightsConfig.findUnique({ where: { id } });
    if (!target) {
      throw new NotFoundException('Ağırlık versiyonu bulunamadı.');
    }
    if (target.active) {
      return { success: true, message: 'Bu versiyon zaten aktif.' };
    }

    const previousActive = await this.prisma.weightsConfig.findFirst({ where: { active: true } });

    // idx_weights_active kısmi unique indeksi (007_config.sql) aynı anda sadece bir aktif
    // satıra izin veriyor -- önce eskisini kapatmadan yeniyi açmak unique ihlali verir.
    await this.prisma.$transaction([
      this.prisma.weightsConfig.updateMany({ where: { active: true }, data: { active: false } }),
      this.prisma.weightsConfig.update({ where: { id }, data: { active: true } }),
    ]);

    return {
      success: true,
      message: 'Ağırlık versiyonu aktifleştirildi.',
      _audit: { before: previousActive ? { version: previousActive.version, id: previousActive.id } : null, after: { version: target.version, id: target.id } },
    };
  }

  // ── API Keys (Faz 3.6) ──

  async listApiKeys() {
    const rows = await this.prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, userId: true, name: true, scopes: true, lastUsed: true, expiresAt: true, createdAt: true, revokedAt: true },
    });
    return { data: rows };
  }

  // Anahtar sadece BU YANITTA bir kez görünür, sonrasında sadece hash'i saklanıyor (docs/04) --
  // refresh token/K-15 ile aynı kural: uzun, sistem üretimi bir token asla bcrypt ile
  // hash'lenmez (72 bayt kırpması + ortak önek çakışması riski), SHA-256 kullanılıyor.
  async createApiKey(dto: CreateApiKeyDto) {
    const targetUser = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!targetUser) {
      throw new BadRequestException('Belirtilen kullanıcı bulunamadı.');
    }

    const rawKey = `eco_${randomBytes(32).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const created = await this.prisma.apiKey.create({
      data: {
        userId: dto.userId,
        keyHash,
        name: dto.name,
        scopes: dto.scopes?.length ? dto.scopes : undefined,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });

    return { success: true, apiKeyId: created.id, key: rawKey, message: 'API anahtarı oluşturuldu. Bu anahtarı şimdi kaydedin, bir daha gösterilmeyecek.' };
  }

  async revokeApiKey(id: string) {
    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!key) {
      throw new NotFoundException('API anahtarı bulunamadı.');
    }
    if (key.revokedAt) {
      return { success: true, message: 'Bu anahtar zaten iptal edilmiş.' };
    }

    await this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    return { success: true, message: 'API anahtarı iptal edildi.' };
  }

  // ── Audit Log (numarasız) ──

  async listAuditLog(query: AuditLogQueryDto) {
    const { skip, take, page, limit } = this.paginate(query);
    const where: Prisma.AuditLogWhereInput = {};
    if (query.entity) where.entity = query.entity;
    if (query.entityId) where.entityId = query.entityId;

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) } };
  }
}
