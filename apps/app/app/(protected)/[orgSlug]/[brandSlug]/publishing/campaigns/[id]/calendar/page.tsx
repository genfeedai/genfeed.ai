import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { CampaignDetailShell } from '@pages/campaigns';
import { Suspense } from 'react';
import ContentCalendarPage from '../../../calendar/content-calendar-page';

export const generateMetadata = createPageMetadata('Campaign Calendar');

export default async function PublishingCampaignCalendarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense fallback={null}>
      <CampaignDetailShell campaignId={id} section="calendar">
        <ContentCalendarPage campaignId={id} />
      </CampaignDetailShell>
    </Suspense>
  );
}
