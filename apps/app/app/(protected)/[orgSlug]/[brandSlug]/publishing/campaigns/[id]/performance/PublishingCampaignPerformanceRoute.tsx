'use client';

import { useParams } from 'next/navigation';
import {
  CampaignDetailPerformance,
  CampaignDetailShell,
} from '@/features/campaigns';
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
