import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { OutreachCampaignDetail } from '@pages/agents';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Outreach Campaign Details');

export default function OutreachCampaignDetailRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <OutreachCampaignDetail />
    </Suspense>
  );
}
