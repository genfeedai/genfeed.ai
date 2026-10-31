import PublishingCampaignAdsRoute from '@app/(protected)/[orgSlug]/[brandSlug]/publishing/campaigns/[id]/ads/PublishingCampaignAdsRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Campaign Ads');

export default function PublishingCampaignAdsPage() {
  return (
    <Suspense fallback={null}>
      <PublishingCampaignAdsRoute />
    </Suspense>
  );
}
