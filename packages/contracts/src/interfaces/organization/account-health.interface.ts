import type { CredentialPlatform, SocialWarmupSignalStatus } from '../..';

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
  accountAgeDays?: number | null;
  accountAgeSource?: string;
  accountAgeStatus?: SocialWarmupSignalStatus;
  connectedDays: number;
  publishedPosts: number;
  profileSignals: number;
  recentFailures: number;
}

export type AccountHealthReconnectReason = 'disconnected' | 'partial_scopes';

export interface AccountHealthReconnect {
  credentialId: string;
  isAvailable: boolean;
  platform?: string;
  reason: AccountHealthReconnectReason;
}

export interface AccountHealthSummary {
  assessedAt?: string;
  credentialId: string;
  handle?: string;
  label: string;
  platform: CredentialPlatform;
  reconnect?: AccountHealthReconnect;
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
