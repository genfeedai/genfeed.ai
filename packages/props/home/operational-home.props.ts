import type { IBrand } from '@genfeedai/contracts/interfaces';
import type { ApiKey } from '@genfeedai/models/auth/api-key.model';

export interface ConnectGenfeedMetadata {
  lastVerifiedAt: string;
  transport: 'streamable-http';
}

/**
 * An agent that can reach Genfeed over MCP: a manually verified key, or an
 * OAuth session key the MCP server has already authenticated with.
 */
export interface VerifiedMcpConnection {
  apiKey: ApiKey;
  /** OAuth client name the agent registered with; null for manual keys. */
  clientName: string | null;
  method: 'manual-key' | 'oauth';
  verifiedAt: string;
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
