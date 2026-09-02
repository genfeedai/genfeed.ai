import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { CampaignsListPage } from '@pages/campaigns';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Campaigns');

export default function PublishingCampaignsPage() {
  return (
    <Suspense fallback={null}>
      <CampaignsListPage />
    </Suspense>
  );
}
