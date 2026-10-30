'use client';

import { useParams } from 'next/navigation';
import { CampaignFormPage } from '@/features/campaigns';
import { readRouteParam } from '@/lib/route-params';

export default function PublishingCampaignEditRoute() {
  const params = useParams<{ id: string }>();
  const id = readRouteParam(params.id);

  return <CampaignFormPage campaignId={id} />;
}
