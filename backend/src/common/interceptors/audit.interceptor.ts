import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_KEY, AuditMetadata } from '../decorators/audit.decorator';

// Global interceptor, opt-in via @Audit(action, entity) on a route handler.
// Writes happen after the handler succeeds and never block or fail the
// response -- a broken audit write must not break the underlying mutation.
//
// before/after diffing is intentionally out of scope here: it needs a
// pre-mutation read that only the owning service can do cheaply. Faz 1+
// services that need it should pass `before`/`after` explicitly instead of
// extending this interceptor's guesswork.
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
    const entityId: string | undefined = result?.facility?.id ?? result?.id ?? request.params?.id;
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
