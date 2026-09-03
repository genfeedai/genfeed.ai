'use client';

import { useCampaign } from '@hooks/data/campaigns/use-campaign';
import { useCampaignPerformance } from '@hooks/data/campaigns/use-campaign-performance';
import Card from '@ui/card/Card';
import LoadingState from '@ui/feedback/LoadingState';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

function CampaignCompareColumn({ campaignId }: { campaignId: string }) {
  const { campaign, isLoading } = useCampaign(campaignId);
  const { performance } = useCampaignPerformance(campaignId);

  if (isLoading || !campaign) {
    return <LoadingState />;
  }

  return (
    <Card label={campaign.name}>
      <dl className="grid gap-2 text-sm">
        <div>
          <dt className="text-foreground/50">objective</dt>
          <dd>{campaign.objective || '—'}</dd>
        </div>
        <div>
          <dt className="text-foreground/50">views</dt>
          <dd>{performance?.organic.views.value ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-foreground/50">engagements</dt>
          <dd>{performance?.organic.engagements.value ?? '—'}</dd>
        </div>
      </dl>
    </Card>
  );
}

export default function CampaignComparePage() {
  const translate = useTranslations('pages.publishing.campaigns');
  const searchParams = useSearchParams();
  const ids = (searchParams.get('ids') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 4);

  if (ids.length < 2) {
    return (
      <p className="p-5 text-sm text-foreground/70">
        {translate('compareNeedTwo')}
      </p>
    );
  }

  return (
    <div className="grid gap-4 p-5 sm:grid-cols-2">
      <p className="sm:col-span-2 text-sm text-foreground/70">
        {translate('compareDisclaimer')}
      </p>
      {ids.map((id) => (
        <CampaignCompareColumn campaignId={id} key={id} />
      ))}
    </div>
  );
}
