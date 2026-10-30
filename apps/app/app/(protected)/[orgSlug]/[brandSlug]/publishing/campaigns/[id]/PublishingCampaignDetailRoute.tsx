'use client';

import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import { CampaignDetailOverview, CampaignDetailShell } from '@pages/campaigns';
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
