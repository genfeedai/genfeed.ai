import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { AgentCampaignDetailPage } from '@pages/agents';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Program');

export default function AutomateProgramDetailRoute() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <AgentCampaignDetailPage />
    </Suspense>
  );
}
