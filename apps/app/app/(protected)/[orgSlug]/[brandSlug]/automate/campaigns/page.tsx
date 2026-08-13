import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { AgentCampaignsPage } from '@pages/agents';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Programs');

export default function AutomateProgramsRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AgentCampaignsPage />
    </Suspense>
  );
}
