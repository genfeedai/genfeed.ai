import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { OutreachCampaignWizard } from '@pages/agents';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('New Outreach Campaign');

export default function OutreachCampaignNewRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="list" />}>
      <OutreachCampaignWizard />
    </Suspense>
  );
}
