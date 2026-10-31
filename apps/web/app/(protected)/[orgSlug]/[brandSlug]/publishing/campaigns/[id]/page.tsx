import PublishingCampaignDetailRoute from '@app/(protected)/[orgSlug]/[brandSlug]/publishing/campaigns/[id]/PublishingCampaignDetailRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Campaign');

export default function PublishingCampaignDetailPage() {
  return (
    <Suspense fallback={null}>
      <PublishingCampaignDetailRoute />
    </Suspense>
  );
}
