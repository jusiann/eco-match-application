import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Marks a route as exempt from JwtAuthGuard even inside an otherwise-guarded controller
// (e.g. signed public DPP endpoints living alongside owner-only materials routes).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
