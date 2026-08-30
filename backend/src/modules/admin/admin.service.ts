import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ReviewStatus, UserRole, MaterialClass, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCarbonFactorDto, CreateUserDto, UpdateUserDto, ListQueryDto, AuditLogQueryDto, UpdateConfigBody } from './admin.dto';

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
