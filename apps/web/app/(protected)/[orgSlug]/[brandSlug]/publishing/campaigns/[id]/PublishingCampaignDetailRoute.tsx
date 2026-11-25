'use client';

import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import CampaignDetailOverview from '@/features/campaigns/detail/CampaignDetailOverview';
import CampaignDetailShell from '@/features/campaigns/detail/CampaignDetailShell';
import { readRouteParam } from '@/lib/route-params';

export default function PublishingCampaignDetailRoute() {
  const params = useRouteParams<{ id: string }>();
  const id = readRouteParam(params.id);

  return (
    <CampaignDetailShell campaignId={id} section="overview">
      <CampaignDetailOverview campaignId={id} />
    </CampaignDetailShell>
  );
}
