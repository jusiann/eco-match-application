import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OsbsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.osb.findMany({
      select: { id: true, name: true, city: true },
      orderBy: { name: 'asc' },
    });
  }
}
