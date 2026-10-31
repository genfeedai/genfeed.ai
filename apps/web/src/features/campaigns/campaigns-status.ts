import {
  ContentCampaignItemOutcomeStatus,
  ContentCampaignLifecycleAction,
  ContentCampaignStatus,
  canApplyContentCampaignLifecycle,
} from '@genfeedai/contracts';
import type { ICampaignLifecycleItemOutcome } from '@genfeedai/contracts/interfaces';

export const CAMPAIGN_STATUS_LABELS: Record<ContentCampaignStatus, string> = {
  [ContentCampaignStatus.ACTIVE]: 'Active',
  [ContentCampaignStatus.ARCHIVED]: 'Archived',
  [ContentCampaignStatus.COMPLETED]: 'Completed',
  [ContentCampaignStatus.DRAFT]: 'Draft',
  [ContentCampaignStatus.PAUSED]: 'Paused',
  [ContentCampaignStatus.SCHEDULED]: 'Scheduled',
};

export const CAMPAIGN_STATUS_FILTERS: Array<{
  label: string;
  value: string;
}> = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: ContentCampaignStatus.DRAFT },
  { label: 'Scheduled', value: ContentCampaignStatus.SCHEDULED },
  { label: 'Active', value: ContentCampaignStatus.ACTIVE },
  { label: 'Paused', value: ContentCampaignStatus.PAUSED },
  { label: 'Completed', value: ContentCampaignStatus.COMPLETED },
  { label: 'Archived', value: ContentCampaignStatus.ARCHIVED },
];

export function parseCampaignStatusFilter(
  value?: string | null,
): ContentCampaignStatus | undefined {
  return Object.values(ContentCampaignStatus).includes(
    value as ContentCampaignStatus,
  )
    ? (value as ContentCampaignStatus)
    : undefined;
}

export function toDateInputValue(value?: string | null): string {
  if (!value) {
    return '';
  }
  return value.slice(0, 10);
}

export function visibleCampaignDeskActions(status: ContentCampaignStatus): {
  canArchive: boolean;
  canComplete: boolean;
  canGenerate: boolean;
  canPause: boolean;
  canRestore: boolean;
  canStart: boolean;
} {
  return {
    canArchive: status !== ContentCampaignStatus.ARCHIVED,
    canComplete:
      status === ContentCampaignStatus.ACTIVE ||
      status === ContentCampaignStatus.PAUSED ||
      status === ContentCampaignStatus.SCHEDULED,
    canGenerate: canApplyContentCampaignLifecycle(
      status,
      ContentCampaignLifecycleAction.GENERATE,
    ),
    canPause:
      status === ContentCampaignStatus.ACTIVE ||
      status === ContentCampaignStatus.SCHEDULED,
    canRestore: status === ContentCampaignStatus.ARCHIVED,
    canStart:
      status === ContentCampaignStatus.DRAFT ||
      status === ContentCampaignStatus.PAUSED ||
      status === ContentCampaignStatus.SCHEDULED,
  };
}

export function summarizeCampaignLifecycleItems(
  items: ICampaignLifecycleItemOutcome[],
): {
  failed: number;
  ineligible: number;
  skipped: number;
  succeeded: number;
} {
  const summary = {
    failed: 0,
    ineligible: 0,
    skipped: 0,
    succeeded: 0,
  };

  for (const item of items) {
    if (item.status === ContentCampaignItemOutcomeStatus.FAILED) {
      summary.failed += 1;
    } else if (item.status === ContentCampaignItemOutcomeStatus.INELIGIBLE) {
      summary.ineligible += 1;
    } else if (item.status === ContentCampaignItemOutcomeStatus.SKIPPED) {
      summary.skipped += 1;
    } else if (item.status === ContentCampaignItemOutcomeStatus.SUCCEEDED) {
      summary.succeeded += 1;
    }
  }

  return summary;
}
