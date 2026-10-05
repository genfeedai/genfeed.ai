'use client';

import { CampaignDetailOverview, CampaignDetailShell } from '@pages/campaigns';

import { useParams } from 'next/navigation';
import { readRouteParam } from '@/lib/route-params';

export default function PublishingCampaignDetailRoute() {
  const params = useParams<{ id: string }>();
  const id = readRouteParam(params.id);

  return (
    <CampaignDetailShell campaignId={id} section="overview">
      <CampaignDetailOverview campaignId={id} />
    </CampaignDetailShell>
  );
}
