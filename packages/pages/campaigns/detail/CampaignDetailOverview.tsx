'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { DATE_FORMATS, formatDate } from '@helpers/formatting/date/date.helper';
import { useCampaign } from '@hooks/data/campaigns/use-campaign';
import { CAMPAIGN_STATUS_LABELS } from '@pages/campaigns/campaigns-status';
import Card from '@ui/card/Card';
import { useTranslations } from 'next-intl';

function formatCampaignDate(value?: string | null): string {
  if (!value) {
    return '—';
  }
  return formatDate(value, DATE_FORMATS.DISPLAY_DATE) || '—';
}

export default function CampaignDetailOverview({
  campaignId,
}: {
  campaignId: string;
}) {
  const translate = useTranslations('pages.publishing.campaigns');
  const { campaign } = useCampaign(campaignId);
  const { brands } = useBrand();

  if (!campaign) {
    return null;
  }

  const brandLabel =
    brands.find((brand) => brand.id === campaign.brandId)?.label ?? '—';

  return (
    <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-2">
      <Card label={translate('overviewDetails')}>
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-foreground/50">{translate('columns.brand')}</dt>
            <dd className="mt-1 text-foreground">{brandLabel}</dd>
          </div>
          <div>
            <dt className="text-foreground/50">
              {translate('columns.objective')}
            </dt>
            <dd className="mt-1 text-foreground">
              {campaign.objective || '—'}
            </dd>
          </div>
          <div>
            <dt className="text-foreground/50">{translate('columns.dates')}</dt>
            <dd className="mt-1 text-foreground">
              {formatCampaignDate(campaign.startDate)} –{' '}
              {formatCampaignDate(campaign.endDate)}
            </dd>
          </div>
          <div>
            <dt className="text-foreground/50">
              {translate('columns.status')}
            </dt>
            <dd className="mt-1 text-foreground">
              {CAMPAIGN_STATUS_LABELS[campaign.status] ?? campaign.status}
            </dd>
          </div>
        </dl>
      </Card>
      <Card label={translate('brief')}>
        <p className="whitespace-pre-wrap text-sm text-foreground/80">
          {campaign.brief || translate('emptyBrief')}
        </p>
      </Card>
    </div>
  );
}
