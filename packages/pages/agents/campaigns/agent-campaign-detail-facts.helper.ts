import type { RecordFact } from '@genfeedai/props/ui/record-detail/record-fact-line.props';
import { DATE_FORMATS, formatDate } from '@helpers/formatting/date/date.helper';
import type { AgentCampaign } from '@services/automation/agent-campaigns.service';

function formatQuota(quota: AgentCampaign['contentQuota']): string | undefined {
  if (!quota) {
    return undefined;
  }

  const parts = [
    quota.posts ? `${quota.posts} posts` : undefined,
    quota.images ? `${quota.images} images` : undefined,
    quota.videos ? `${quota.videos} videos` : undefined,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(', ') : undefined;
}

/**
 * The program's own known facts for the record detail fact line (#5483). The
 * KPI strip already covers the numeric usage metrics, so this line covers
 * the lifecycle facts it doesn't: status, dates, agent count and quota.
 * `statusLabel` is resolved by the caller through `common.agentCampaign.status`.
 */
export function buildAgentCampaignFacts(
  campaign: AgentCampaign,
  statusLabel: string,
): RecordFact[] {
  return [
    { id: 'status', label: 'Status', value: statusLabel },
    {
      id: 'startDate',
      label: 'Started',
      value: formatDate(campaign.startDate, DATE_FORMATS.DISPLAY_DATE),
    },
    {
      id: 'endDate',
      label: 'Ends',
      value: campaign.endDate
        ? formatDate(campaign.endDate, DATE_FORMATS.DISPLAY_DATE)
        : undefined,
    },
    {
      id: 'agents',
      label: 'Agents',
      value: campaign.agents.length,
    },
    {
      id: 'quota',
      label: 'Quota',
      value: formatQuota(campaign.contentQuota),
    },
  ];
}
