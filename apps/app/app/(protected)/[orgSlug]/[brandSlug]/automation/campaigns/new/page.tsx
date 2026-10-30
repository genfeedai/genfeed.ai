import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import OrganizationModulePreferenceGate from '@ui/guards/organization-module/OrganizationModulePreferenceGate';
import { Suspense } from 'react';
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
