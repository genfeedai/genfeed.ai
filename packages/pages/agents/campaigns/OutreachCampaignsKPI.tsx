'use client';

import type { OutreachCampaign } from '@services/automation/outreach-campaigns.service';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import { useTranslations } from 'next-intl';

type Props = {
  campaigns: OutreachCampaign[];
  activeCampaignsCount: number;
  totalReplies: number;
  successRate: number;
};

export default function OutreachCampaignsKPI({
  campaigns,
  activeCampaignsCount,
  totalReplies,
  successRate,
}: Props) {
  const translate = useTranslations('pages.outreachCampaign');

  return (
    <KPISection
      title={translate('statisticsTitle')}
      gridCols={{ desktop: 4, mobile: 2, tablet: 4 }}
      items={[
        {
          description: translate('allSequences'),
          label: translate('totalSequences'),
          value: campaigns.length,
        },
        {
          description: 'Currently running',
          label: 'Active',
          value: activeCampaignsCount,
          valueClassName: 'text-success',
        },
        {
          description: 'Successfully posted',
          label: 'Total Replies',
          value: totalReplies.toLocaleString(),
        },
        {
          description: 'Of all attempts',
          label: 'Success Rate',
          value: `${successRate}%`,
          valueClassName: successRate >= 80 ? 'text-success' : 'text-warning',
        },
      ]}
    />
  );
}
