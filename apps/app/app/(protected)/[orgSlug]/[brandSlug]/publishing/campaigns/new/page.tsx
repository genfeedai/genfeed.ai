import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { CampaignFormPage } from '@pages/campaigns';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('New Campaign');

export default function PublishingCampaignNewPage() {
  return (
    <Suspense fallback={null}>
      <CampaignFormPage />
    </Suspense>
  );
}
