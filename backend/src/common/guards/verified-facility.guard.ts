import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Runs after JwtAuthGuard. Blocks facilities that have not passed admin
// document verification (S1) from reaching material/matching endpoints.
@Injectable()
export class VerifiedFacilityGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.sub;

    const user = userId
      ? await this.prisma.user.findUnique({
          where: { id: userId },
          select: { facility: { select: { verified: true } } },
        })
      : null;

    if (!user?.facility.verified) {
      throw new ForbiddenException({
        error: 'FACILITY_NOT_VERIFIED',
        message: 'Tesisiniz henüz onaylanmadı.',
      });
    }

    return true;
  }
}
