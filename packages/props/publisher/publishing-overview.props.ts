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
  groups: PublishingOverviewQueueGroup[];
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
  groups: PublishingOverviewBlockedGroup[];
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
  gaps: PublishingOverviewCadenceGap[];
}
