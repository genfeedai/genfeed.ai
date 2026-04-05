import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { AgentCampaignDetailPage } from '@pages/agents';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Campaign Details');

export default function OrchestrationCampaignDetailRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AgentCampaignDetailPage />
    </Suspense>
  );
}
