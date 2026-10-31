import type { RecordFact } from '@genfeedai/props/ui/record-detail/record-fact-line.props';
import { DATE_FORMATS, formatDate } from '@helpers/formatting/date/date.helper';
import type { OutreachCampaign } from '@services/automation/outreach-campaigns.service';

/**
 * The sequence's own known facts for the record detail fact line (#5483).
 * The KPI strip already covers the numeric target stats, so this line covers
 * the lifecycle facts it doesn't: platform, type, status and dates.
 * `platformLabel`/`statusLabel` are resolved by the caller through
 * `common.outreachCampaign`.
 */
export function buildOutreachCampaignFacts(
  campaign: OutreachCampaign,
  platformLabel: string,
  statusLabel: string,
): RecordFact[] {
  return [
    { id: 'platform', label: 'Platform', value: platformLabel },
    { id: 'type', label: 'Type', value: campaign.campaignType },
    { id: 'status', label: 'Status', value: statusLabel },
    {
      id: 'startedAt',
      label: 'Started',
      value: formatDate(campaign.startedAt, DATE_FORMATS.DISPLAY_DATE),
    },
    {
      id: 'lastActivityAt',
      label: 'Last activity',
      value: formatDate(campaign.lastActivityAt, DATE_FORMATS.DISPLAY_DATE),
    },
  ];
}
