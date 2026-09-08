import type { IBrand } from '@genfeedai/contracts/interfaces';

export interface ConnectGenfeedMetadata {
  lastVerifiedAt: string;
  transport: 'streamable-http';
}

export interface CredentialHealthSummary {
  attention: number;
  healthy: number;
  total: number;
  unknown: number;
}

export interface OperationalHomeScope {
  brand: IBrand | undefined;
  brandSlug: string | undefined;
  organizationId: string;
  orgSlug: string;
}

export interface UpcomingScheduleDay {
  count: number;
  date: Date;
}
