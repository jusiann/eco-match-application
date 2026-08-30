import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, finalize, of, shareReplay, tap } from 'rxjs';
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
  // `cache` sadece TAMAMLANMIŞ bir isteğin sonucunu tutuyor -- aynı anahtarla gelen ikinci
  // istek birincisi hâlâ işlenirken (ör. istemcinin ağ gecikmesi yüzünden gerçekten eşzamanlı
  // iki bağlantı açması) buraya bakınca boş bulur ve handler'ı BİR DAHA çalıştırırdı, aynı
  // kaydı iki kez oluşturarak. `inFlight`, henüz tamamlanmamış isteğin paylaşılan
  // Observable'ını tutar; ikinci istek handler'ı tekrar çağırmak yerine BİRİNCİNİN sonucuna
  // abone olur. Map'e yazma senkron (await yok) olduğu için Node'un tek thread'li olay
  // döngüsünde araya girecek bir pencere kalmıyor (K-30).
  private readonly inFlight = new Map<string, Observable<unknown>>();
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
    const response = context.switchToHttp().getResponse();

    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      response.status(cached.status);
      return of(cached.body);
    }

    const pending = this.inFlight.get(cacheKey);
    if (pending) {
      return pending;
    }

    const shared$ = next.handle().pipe(
      tap((body) => {
        const status = response.statusCode ?? 200;
        if (status >= 200 && status < 300) {
          this.cache.set(cacheKey, { status, body, expiresAt: Date.now() + TTL_MS });
        }
      }),
      finalize(() => this.inFlight.delete(cacheKey)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.inFlight.set(cacheKey, shared$);
    return shared$;
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
