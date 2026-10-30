'use client';

import { useParams } from 'next/navigation';
import { CampaignDetailAds, CampaignDetailShell } from '@/features/campaigns';
import { readRouteParam } from '@/lib/route-params';

export default function PublishingCampaignAdsRoute() {
  const params = useParams<{ id: string }>();
  const id = readRouteParam(params.id);

  return (
    <CampaignDetailShell campaignId={id} section="ads">
      <CampaignDetailAds campaignId={id} />
    </CampaignDetailShell>
  );
}
