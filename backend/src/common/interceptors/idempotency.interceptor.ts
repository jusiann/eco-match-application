import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of, tap } from 'rxjs';
import { IDEMPOTENT_KEY } from '../decorators/idempotent.decorator';

interface CacheEntry {
  status: number;
  body: unknown;
  expiresAt: number;
}

const IDEMPOTENCY_HEADER = 'idempotency-key';
const TTL_MS = 24 * 60 * 60 * 1000; // docs/04: 24 saat
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  // Tek process içi Map -- MVP için yeterli. Birden fazla instance'a çıkılırsa (yatay
  // ölçekleme) Redis'e taşınmalı, aksi hâlde her instance kendi cache'ini tutar ve
  // dedup garantisi bozulur. Bkz. K-22.
  private readonly cache = new Map<string, CacheEntry>();
  private lastSweep = Date.now();

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isIdempotent = this.reflector.get<boolean | undefined>(IDEMPOTENT_KEY, context.getHandler());
    if (!isIdempotent) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const key = request.headers?.[IDEMPOTENCY_HEADER];
    if (!key) {
      return next.handle();
    }

    this.sweepExpired();

    const cacheKey = `${request.user?.sub ?? 'anon'}:${request.method}:${request.url}:${key}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      context.switchToHttp().getResponse().status(cached.status);
      return of(cached.body);
    }

    return next.handle().pipe(
      tap((body) => {
        const status = context.switchToHttp().getResponse().statusCode ?? 200;
        if (status >= 200 && status < 300) {
          this.cache.set(cacheKey, { status, body, expiresAt: Date.now() + TTL_MS });
        }
      }),
    );
  }

  private sweepExpired() {
    if (Date.now() - this.lastSweep < SWEEP_INTERVAL_MS) return;
    this.lastSweep = Date.now();
    const now = Date.now();
    for (const [k, v] of this.cache.entries()) {
      if (v.expiresAt <= now) this.cache.delete(k);
    }
  }
}
