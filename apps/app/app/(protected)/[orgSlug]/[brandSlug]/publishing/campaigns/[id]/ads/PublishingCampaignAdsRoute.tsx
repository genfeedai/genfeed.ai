'use client';

import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import { CampaignDetailAds, CampaignDetailShell } from '@pages/campaigns';
import { readRouteParam } from '@/lib/route-params';

export default function PublishingCampaignAdsRoute() {
  const params = useRouteParams<{ id: string }>();
  const id = readRouteParam(params.id);

  return (
    <CampaignDetailShell campaignId={id} section="ads">
      <CampaignDetailAds campaignId={id} />
    </CampaignDetailShell>
  );
}
