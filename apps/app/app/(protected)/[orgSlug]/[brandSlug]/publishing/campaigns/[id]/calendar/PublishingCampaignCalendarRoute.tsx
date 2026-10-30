'use client';

import ContentCalendarPage from '@app/(protected)/[orgSlug]/[brandSlug]/publishing/calendar/content-calendar-page';
import { useParams } from 'next/navigation';
import { CampaignDetailShell } from '@/features/campaigns';
import { readRouteParam } from '@/lib/route-params';

export default function PublishingCampaignCalendarRoute() {
  const params = useParams<{ id: string }>();
  const id = readRouteParam(params.id);

  return (
    <CampaignDetailShell campaignId={id} section="calendar">
      <ContentCalendarPage campaignId={id} />
    </CampaignDetailShell>
  );
}
