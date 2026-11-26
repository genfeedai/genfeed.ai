'use client';

import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import CampaignDetailAds from '@/features/campaigns/detail/CampaignDetailAds';
import CampaignDetailShell from '@/features/campaigns/detail/CampaignDetailShell';
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
