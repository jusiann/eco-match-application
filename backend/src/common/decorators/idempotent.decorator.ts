import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT_KEY = 'idempotent';

// Marks a mutating POST as safe to retry with the same Idempotency-Key header --
// see IdempotencyInterceptor. The header itself stays optional (docs/04): a client that
// doesn't send it just gets no dedup, never an error.
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);
