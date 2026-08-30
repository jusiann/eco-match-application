import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_KEY, AuditMetadata } from '../decorators/audit.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AuditInterceptor');

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMetadata | undefined>(AUDIT_KEY, context.getHandler());
    if (!meta) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      tap((result) => {
        void this.write(meta, request, result);
      }),
    );
  }

  private async write(meta: AuditMetadata, request: any, result: any): Promise<void> {
    // Farklı endpoint'ler farklı kaynak-özel id alan adı döner (outputId, inputId,
    // matchId, userId...) -- create endpoint'lerinde :id route param'ı da olmuyor.
    // Bilinen tüm örüntüleri sırayla dene (K-29).
    const entityId: string | undefined =
      request.params?.id ??
      result?.facility?.id ??
      result?.id ??
      result?.outputId ??
      result?.inputId ??
      result?.matchId ??
      result?.userId ??
      result?.passportId ??
      result?.documentId;
    if (!entityId) {
      return;
    }

    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: request.user?.sub ?? null,
          action: meta.action,
          entity: meta.entity,
          entityId,
          ipAddress: request.ip ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`audit_log write failed: ${(err as Error).message}`);
    }
  }
}
