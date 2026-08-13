import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { AgentCampaignDetailPage } from '@pages/agents';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Program');

export default function AutomateProgramDetailRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AgentCampaignDetailPage />
    </Suspense>
  );
}
