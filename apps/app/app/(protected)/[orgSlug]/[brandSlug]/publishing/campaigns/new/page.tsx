import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import { CampaignsListPage } from '@/features/campaigns';

export const generateMetadata = createPageMetadata('New Campaign');

export default function PublishingCampaignNewPage() {
  return (
    <Suspense fallback={null}>
      <CampaignsListPage isCreateOpen />
    </Suspense>
  );
}
