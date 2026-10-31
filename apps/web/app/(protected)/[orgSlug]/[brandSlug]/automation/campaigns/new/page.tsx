import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import OrganizationModulePreferenceGate from '@/components/guards/organization-module/OrganizationModulePreferenceGate';
import { AgentCampaignNewPage } from '@/features/agents';

export const generateMetadata = createPageMetadata('New Program');

export default function AutomationProgramNewRoute() {
  return (
    <OrganizationModulePreferenceGate moduleId="automation">
      <Suspense fallback={null}>
        <AgentCampaignNewPage />
      </Suspense>
    </OrganizationModulePreferenceGate>
  );
}
