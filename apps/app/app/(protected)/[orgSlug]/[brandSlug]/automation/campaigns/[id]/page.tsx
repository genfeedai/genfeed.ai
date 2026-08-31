import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { AgentCampaignDetailPage } from '@pages/agents';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Program');

export default function AutomationProgramDetailRoute() {
  return (
    <Suspense fallback={null}>
      <AgentCampaignDetailPage />
    </Suspense>
  );
}
