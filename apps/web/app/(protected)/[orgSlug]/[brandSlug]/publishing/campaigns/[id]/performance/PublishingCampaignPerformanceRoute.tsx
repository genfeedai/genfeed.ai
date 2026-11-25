'use client';

import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import CampaignDetailPerformance from '@/features/campaigns/detail/CampaignDetailPerformance';
import CampaignDetailShell from '@/features/campaigns/detail/CampaignDetailShell';
import { readRouteParam } from '@/lib/route-params';

export default function PublishingCampaignPerformanceRoute() {
  const params = useRouteParams<{ id: string }>();
  const id = readRouteParam(params.id);

  return (
    <CampaignDetailShell campaignId={id} section="performance">
      <CampaignDetailPerformance campaignId={id} />
    </CampaignDetailShell>
  );
}
