import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import { AgentCampaignsPage } from '@/features/agents';

export const generateMetadata = createPageMetadata('Programs');

export default function AutomationProgramsRoute() {
  return (
    <Suspense fallback={null}>
      <AgentCampaignsPage />
    </Suspense>
  );
}
