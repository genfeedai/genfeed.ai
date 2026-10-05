'use client';

import { CampaignFormPage } from '@pages/campaigns';

import { useParams } from 'next/navigation';
import { readRouteParam } from '@/lib/route-params';

export default function PublishingCampaignEditRoute() {
  const params = useParams<{ id: string }>();
  const id = readRouteParam(params.id);

  return <CampaignFormPage campaignId={id} />;
}
