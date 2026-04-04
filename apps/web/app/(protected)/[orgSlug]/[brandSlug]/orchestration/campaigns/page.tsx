import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { AgentCampaignsPage } from '@pages/agents';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Agent Campaigns');

export default function OrchestrationCampaignsRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AgentCampaignsPage />
    </Suspense>
  );
}
