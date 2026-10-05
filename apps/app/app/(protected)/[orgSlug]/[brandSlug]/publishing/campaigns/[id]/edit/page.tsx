import PublishingCampaignEditRoute from '@app/(protected)/[orgSlug]/[brandSlug]/publishing/campaigns/[id]/edit/PublishingCampaignEditRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Edit Campaign');

export default function PublishingCampaignEditPage() {
  return (
    <Suspense fallback={null}>
      <PublishingCampaignEditRoute />
    </Suspense>
  );
}
