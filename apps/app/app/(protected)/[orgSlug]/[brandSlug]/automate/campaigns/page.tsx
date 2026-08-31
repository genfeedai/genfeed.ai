import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { AgentCampaignsPage } from '@pages/agents';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Programs');

export default function AutomateProgramsRoute() {
  return (
    <Suspense fallback={null}>
      <AgentCampaignsPage />
    </Suspense>
  );
}
