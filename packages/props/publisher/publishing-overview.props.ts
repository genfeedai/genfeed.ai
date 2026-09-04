import type { AsyncState } from '../shared/async-state.types';

/** One SCHEDULED channel target due within the next 24 hours. */
export interface PublishingOverviewQueueItem {
  accountLabel: string;
  href: string;
  platform: string;
  releaseId: string;
  scheduledAt: string;
  targetId: string;
  title: string;
}

export interface PublishingOverviewQueueGroup {
  bucket: 'near' | 'later';
  items: PublishingOverviewQueueItem[];
}

export interface PublishingOverviewQueueSectionProps {
  onRetry: () => void;
  state: AsyncState<PublishingOverviewQueueGroup[]>;
}

/** FAILED channel targets grouped by their structured error code. */
export interface PublishingOverviewBlockedGroup {
  accounts: string[];
  code: string;
  count: number;
  href: string;
  message: string;
}

export interface PublishingOverviewBlockedSectionProps {
  onRetry: () => void;
  state: AsyncState<PublishingOverviewBlockedGroup[]>;
}

/** Per-connected-account gap since the last publish, and whether one is queued. */
export interface PublishingOverviewCadenceGap {
  accountLabel: string;
  credentialId: string;
  gapDays: number | null;
  hasUpcoming: boolean;
  holdPublishing: boolean;
  lastPublishedAt: string | null;
  needsReconnect: boolean;
  platform: string;
}

export interface PublishingOverviewCadenceSectionProps {
  onRetry: () => void;
  state: AsyncState<PublishingOverviewCadenceGap[]>;
}

/** One connected account's warmup and reconnect state on the Overview desk. */
export interface PublishingOverviewHealthRow {
  accountLabel: string;
  connectedDays: number;
  credentialId: string;
  holdPublishing: boolean;
  holdReason?: string;
  needsReconnect: boolean;
  platform: string;
  publishedPosts: number;
  recentFailures: number;
  riskLevel: 'high' | 'low' | 'medium' | 'unknown';
  score: number;
  state: 'healthy' | 'not_started' | 'risky' | 'warming';
}

export interface PublishingOverviewHealthSectionProps {
  onRetry: () => void;
  state: AsyncState<PublishingOverviewHealthRow[]>;
}
