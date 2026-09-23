'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ContentCampaignStatus } from '@genfeedai/contracts';
import { DATE_FORMATS, formatDate } from '@helpers/formatting/date/date.helper';
import { useCampaign } from '@hooks/data/campaigns/use-campaign';
import { CAMPAIGN_STATUS_LABELS } from '@pages/campaigns/campaigns-status';
import CampaignAccounts from '@pages/campaigns/detail/CampaignAccounts';
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
    <div className="grid min-w-0 gap-4 py-5">
      <div className="flex flex-col gap-2">
        <h2 className="break-words text-xl font-semibold">{campaign.name}</h2>
        <p className="text-sm text-muted">{translate('setup.description')}</p>
        {campaign.status === ContentCampaignStatus.DRAFT ? (
          <p className="text-sm">{translate('accounts.nextStep')}</p>
        ) : null}
      </div>
      <CampaignAccounts brandId={campaign.brandId} />
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
              {campaign.objective || translate('setup.missingObjective')}
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
        <p className="whitespace-pre-wrap break-words text-sm text-secondary">
          {campaign.brief || translate('emptyBrief')}
        </p>
      </Card>
    </div>
  );
}
