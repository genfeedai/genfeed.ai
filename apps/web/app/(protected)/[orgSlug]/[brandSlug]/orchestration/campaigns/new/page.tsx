import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { AgentCampaignNewPage } from '@pages/agents';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('New Agent Campaign');

export default function OrchestrationCampaignNewRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="list" />}>
      <AgentCampaignNewPage />
    </Suspense>
  );
}
