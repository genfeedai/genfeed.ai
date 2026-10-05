'use client';

import {
  CampaignDetailPerformance,
  CampaignDetailShell,
} from '@pages/campaigns';

import { useParams } from 'next/navigation';
import { readRouteParam } from '@/lib/route-params';

export default function PublishingCampaignPerformanceRoute() {
  const params = useParams<{ id: string }>();
  const id = readRouteParam(params.id);

  return (
    <CampaignDetailShell campaignId={id} section="performance">
      <CampaignDetailPerformance campaignId={id} />
    </CampaignDetailShell>
  );
}
