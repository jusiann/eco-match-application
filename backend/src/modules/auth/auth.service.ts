import { Injectable, BadRequestException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { RegisterDto, LoginDto, UpdateProfileDto, ForgotPasswordDto, ResetPasswordDto } from './auth.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from './email.service';
import * as bcrypt from 'bcrypt';
import { createHash, timingSafeEqual } from 'crypto';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  // Hash token using SHA-256
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private tokensMatch(token: string, storedHash: string): boolean {
    const candidate = Uint8Array.from(Buffer.from(this.hashToken(token), 'hex'));
    const stored = Uint8Array.from(Buffer.from(storedHash, 'hex'));
    return candidate.length === stored.length && timingSafeEqual(candidate, stored);
  }

  // Generate access and refresh token pair
  private generateTokens(user: { id: string; email: string; role: string }) {
    const basePayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(basePayload, { expiresIn: '1h' });
    const refreshToken = this.jwtService.sign({ ...basePayload, type: 'refresh' }, { expiresIn: '30d' });
    return { accessToken, refreshToken };
  }

  // Issue token pair and persist refresh token hash
  private async issueTokens(user: { id: string; email: string; role: string }) {
    const tokens = this.generateTokens(user);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: this.hashToken(tokens.refreshToken) },
    });
    return tokens;
  }

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new BadRequestException('Böyle bir e-posta adresi zaten kayıtlı.');
    }

    const existingFacility = await this.prisma.facility.findUnique({
      where: { taxId: dto.taxId },
    });

    if (existingFacility) {
      throw new BadRequestException('Bu vergi numarası ile kayıtlı bir tesis zaten var.');
    }

    if (dto.osbId) {
      const osb = await this.prisma.osb.findUnique({ where: { id: dto.osbId } });
      if (!osb) {
        throw new BadRequestException('Belirtilen OSB bulunamadı.');
      }
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const facility = await this.prisma.$transaction(async (tx) => {
      const created = await tx.facility.create({
        data: {
          name: dto.name.trim(),
          taxId: dto.taxId,
          sector: dto.sector,
          osbId: dto.osbId ?? null,
          users: {
            create: {
              email: dto.email.toLowerCase(),
              passwordHash: hashedPassword,
              role: 'FACILITY_ADMIN',
              contactName: dto.contactName.trim(),
              phone: dto.phone.trim(),
            },
          },
        },
        include: {
          users: true,
        },
      });

      // location is Unsupported() in Prisma (geography) — written via raw SQL, K-04
      await tx.$executeRaw`
        UPDATE facilities
        SET location = ST_SetSRID(ST_MakePoint(${dto.location.lng}, ${dto.location.lat}), 4326)::geography
        WHERE id = ${created.id}::uuid
      `;

      return created;
    });

    const user = facility.users[0];
    const { accessToken, refreshToken } = await this.issueTokens(user);

    const verificationToken = this.jwtService.sign({ sub: user.id, type: 'email_verify' }, { expiresIn: '24h' });
    await this.emailService.sendVerificationEmail(user.email, verificationToken);

    return {
      success: true,
      message: 'Kayıt başarılı. Doğrulama e-postası gönderildi.',
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
      },
      facility: {
        id: facility.id,
        name: facility.name,
        verified: facility.verified,
      },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { facility: true },
    });

    if (!user) {
      throw new UnauthorizedException('Geçersiz e-posta veya şifre.');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Geçersiz e-posta veya şifre.');
    }

    const { accessToken, refreshToken } = await this.issueTokens(user);

    return {
      success: true,
      message: 'Giriş başarılı',
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      facility: {
        id: user.facility.id,
        name: user.facility.name,
      },
    };
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string; type?: string };
    try {
      payload = this.jwtService.verify(refreshToken);
    } catch {
      throw new UnauthorizedException('Oturum süresi dolmuş, tekrar giriş yapın.');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Geçersiz oturum jetonu.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user?.refreshToken) {
      throw new UnauthorizedException('Oturum bulunamadı, tekrar giriş yapın.');
    }

    if (!this.tokensMatch(refreshToken, user.refreshToken)) {
      throw new UnauthorizedException('Geçersiz oturum jetonu.');
    }

    const tokens = await this.issueTokens(user);

    return {
      success: true,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    };
  }

  async verifyEmail(token: string) {
    let payload: { sub: string; type?: string };
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new BadRequestException('Doğrulama bağlantısının süresi dolmuş veya geçersiz.');
    }

    if (payload.type !== 'email_verify') {
      throw new BadRequestException('Geçersiz doğrulama jetonu.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }

    if (!user.emailVerified) {
      await this.prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
    }

    return { success: true, message: 'E-posta adresiniz doğrulandı.' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });

    if (user) {
      const resetToken = this.jwtService.sign({ sub: user.id, type: 'password_reset' }, { expiresIn: '1h' });
      await this.emailService.sendPasswordResetEmail(user.email, resetToken);
    }

    // Kullanıcı var mı yok mu bilgisini sızdırmamak için cevap her durumda aynı
    return {
      success: true,
      message: 'E-posta adresiniz sistemde kayıtlıysa şifre sıfırlama bağlantısı gönderildi.',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    let payload: { sub: string; type?: string };
    try {
      payload = this.jwtService.verify(dto.token);
    } catch {
      throw new BadRequestException('Sıfırlama bağlantısının süresi dolmuş veya geçersiz.');
    }

    if (payload.type !== 'password_reset') {
      throw new BadRequestException('Geçersiz sıfırlama jetonu.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashedPassword, refreshToken: null },
    });

    return { success: true, message: 'Şifreniz güncellendi. Lütfen tekrar giriş yapın.' };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { facility: true },
    });

    if (!user) {
      throw new NotFoundException('Kullanici bulunamadi.');
    }

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      },
      facility: {
        id: user.facility.id,
        name: user.facility.name,
        sector: user.facility.sector,
        taxId: user.facility.taxId,
        verified: user.facility.verified,
      },
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: dto.email.toLowerCase() },
      });
      if (existingUser && existingUser.id !== userId) {
        throw new BadRequestException('Bu e-posta adresi başka bir hesaba ait.');
      }
    }

    const updateData: any = {};
    if (dto.email) updateData.email = dto.email.toLowerCase();
    if (dto.password) updateData.passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    if (dto.name) {
      await this.prisma.facility.update({
        where: { id: user.facilityId },
        data: { name: dto.name.trim() },
      });
    }

    return {
      success: true,
      message: 'Profil güncellendi',
      facility: { id: user.facilityId },
    };
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });

    return {
      success: true,
      message: 'Başarıyla çıkış yapıldı',
    };
  }

  async deleteAccount(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      await this.prisma.facility.delete({ where: { id: user.facilityId } });
    }

    return {
      success: true,
      message: 'Hesap silindi',
      facility: user ? { id: user.facilityId } : null,
    };
  }
}
