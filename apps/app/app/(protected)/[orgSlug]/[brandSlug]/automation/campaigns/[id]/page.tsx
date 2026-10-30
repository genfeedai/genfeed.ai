import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import { AgentCampaignDetailPage } from '@/features/agents';

export const generateMetadata = createPageMetadata('Program');

export default function AutomationProgramDetailRoute() {
  return (
    <Suspense fallback={null}>
      <AgentCampaignDetailPage />
    </Suspense>
  );
}
