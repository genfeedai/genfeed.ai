import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { CampaignComparePage } from '@pages/campaigns';
import Container from '@ui/layout/container/Container';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Compare Campaigns');

export default function PublishingCampaignComparePage() {
  return (
    <Suspense fallback={null}>
      <Container label="Compare Campaigns" titleVisibility="visible">
        <CampaignComparePage />
      </Container>
    </Suspense>
  );
}
