import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';

export interface AuditMetadata {
  action: string;
  entity: string;
}

export const Audit = (action: string, entity: string) => SetMetadata(AUDIT_KEY, { action, entity });
