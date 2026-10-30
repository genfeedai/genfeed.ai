import type { Platform } from '@genfeedai/contracts';
import type { BrandDetailSocialConnection } from '@genfeedai/props/pages/brand-detail.props';

export interface PlatformHomeContentProps {
  platform: Platform;
}

/**
 * `needsReconnect` takes priority over the health-derived tiers — a
 * disconnected or identity-less credential is not "connected" just because
 * it has no health data yet. See `getPlatformConnectionHealth`.
 */
export type PlatformConnectionHealth =
  | 'attention'
  | 'connected'
  | 'healthy'
  | 'needsReconnect';

export interface PlatformHomeDestinations {
  analytics: string;
  calendar: string;
  create: string;
  live?: string;
  messages: string;
  posts: string;
  queue: string;
  replies?: string;
  settingsSocial: string;
}

export type PlatformHomeConnection = BrandDetailSocialConnection;
