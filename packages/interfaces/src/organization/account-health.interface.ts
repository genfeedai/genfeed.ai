import type { CredentialPlatform } from '@genfeedai/enums';

export type AccountWarmupState =
  | 'not_started'
  | 'warming'
  | 'healthy'
  | 'risky';

export type AccountHealthRiskLevel = 'unknown' | 'low' | 'medium' | 'high';

export interface AccountHealthThresholds {
  minConnectedDays: number;
  minPublishedPosts: number;
  minProfileSignals: number;
  maxRecentFailures: number;
}

export interface AccountHealthSignals {
  connectedDays: number;
  publishedPosts: number;
  profileSignals: number;
  recentFailures: number;
}

export interface AccountHealthOverride {
  confirmedAt?: string;
  confirmedByUserId?: string;
  expiresAt?: string;
  isActive: boolean;
  reason?: string;
}

export interface AccountHealthSummary {
  assessedAt?: string;
  credentialId: string;
  handle?: string;
  holdPublishing: boolean;
  holdReason?: string;
  label: string;
  override: AccountHealthOverride;
  platform: CredentialPlatform;
  riskLevel: AccountHealthRiskLevel;
  score: number;
  signals: AccountHealthSignals;
  state: AccountWarmupState;
  thresholds: AccountHealthThresholds;
}

export interface AssessAccountHealthRequest {
  signals?: Partial<AccountHealthSignals>;
  thresholds?: Partial<AccountHealthThresholds>;
}

export interface ManualAccountHealthOverrideRequest {
  confirm: true;
  expiresAt?: string;
  reason: string;
}
