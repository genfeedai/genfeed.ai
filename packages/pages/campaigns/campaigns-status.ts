import { ContentCampaignStatus } from '@genfeedai/contracts';

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
