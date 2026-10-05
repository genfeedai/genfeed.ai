import PublishingCampaignCalendarRoute from '@app/(protected)/[orgSlug]/[brandSlug]/publishing/campaigns/[id]/calendar/PublishingCampaignCalendarRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Campaign Calendar');

export default function PublishingCampaignCalendarPage() {
  return (
    <Suspense fallback={null}>
      <PublishingCampaignCalendarRoute />
    </Suspense>
  );
}
