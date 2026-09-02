import type { Platform } from '@genfeedai/contracts';
import type { BrandDetailSocialConnection } from '@genfeedai/props/pages/brand-detail.props';

export interface PlatformHomeContentProps {
  platform: Platform;
}

export type PlatformConnectionHealth = 'attention' | 'connected' | 'healthy';

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
