import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { OutreachCampaignsList } from '@pages/agents';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Outreach Campaigns');

export default function OutreachCampaignsRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <OutreachCampaignsList />
    </Suspense>
  );
}
