'use client';

import { useParams } from 'next/navigation';
import {
  CampaignDetailOverview,
  CampaignDetailShell,
} from '@/features/campaigns';
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
