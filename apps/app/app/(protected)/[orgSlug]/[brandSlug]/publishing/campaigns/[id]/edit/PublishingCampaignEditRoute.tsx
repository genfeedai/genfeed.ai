'use client';

import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import { CampaignFormPage } from '@/features/campaigns';
import { readRouteParam } from '@/lib/route-params';

export default function PublishingCampaignEditRoute() {
  const params = useRouteParams<{ id: string }>();
  const id = readRouteParam(params.id);

  return <CampaignFormPage campaignId={id} />;
}
