import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { AgentCampaignNewPage } from '@pages/agents';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('New Program');

export default function AutomateProgramNewRoute() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <AgentCampaignNewPage />
    </Suspense>
  );
}
