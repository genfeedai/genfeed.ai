import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import { CampaignsListPage } from '@/features/campaigns';

export const generateMetadata = createPageMetadata('Campaigns');

export default function PublishingCampaignsPage() {
  return (
    <Suspense fallback={null}>
      <CampaignsListPage />
    </Suspense>
  );
}
