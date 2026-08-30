import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// system_config.value bir Json kolonu -- sayısal eşikler (0.60, 20, 30 gün...) burada
// hardcode edilmiyor, her istekte tablodan okunuyor (AD2 kalibrasyonu deploy istemesin diye)
@Injectable()
export class SystemConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getNumber(key: string, fallback: number): Promise<number> {
    const row = await this.prisma.systemConfig.findUnique({ where: { key } });
    const value = row?.value;
    return typeof value === 'number' ? value : fallback;
  }
}
