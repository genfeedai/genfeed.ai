import PublishingCampaignPerformanceRoute from '@app/(protected)/[orgSlug]/[brandSlug]/publishing/campaigns/[id]/performance/PublishingCampaignPerformanceRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Campaign Performance');

export default function PublishingCampaignPerformancePage() {
  return (
    <Suspense fallback={null}>
      <PublishingCampaignPerformanceRoute />
    </Suspense>
  );
}
