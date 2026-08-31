import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { AgentCampaignNewPage } from '@pages/agents';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('New Program');

export default function AutomationProgramNewRoute() {
  return (
    <Suspense fallback={null}>
      <AgentCampaignNewPage />
    </Suspense>
  );
}
