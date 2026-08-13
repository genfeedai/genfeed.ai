import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { OutreachCampaignDetail } from '@pages/agents';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Outreach sequence');

export default function OutreachSequenceDetailRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <OutreachCampaignDetail />
    </Suspense>
  );
}
