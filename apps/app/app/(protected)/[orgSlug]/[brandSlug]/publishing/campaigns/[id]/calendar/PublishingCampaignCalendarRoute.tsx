'use client';

import ContentCalendarPage from '@app/(protected)/[orgSlug]/[brandSlug]/publishing/calendar/content-calendar-page';
import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import { CampaignDetailShell } from '@pages/campaigns';
import { readRouteParam } from '@/lib/route-params';

export default function PublishingCampaignCalendarRoute() {
  const params = useRouteParams<{ id: string }>();
  const id = readRouteParam(params.id);

  return (
    <CampaignDetailShell campaignId={id} section="calendar">
      <ContentCalendarPage campaignId={id} />
    </CampaignDetailShell>
  );
}
