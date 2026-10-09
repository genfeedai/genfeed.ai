import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { AgentCampaignNewPage } from '@pages/agents';
import OrganizationModulePreferenceGate from '@ui/guards/organization-module/OrganizationModulePreferenceGate';
import { Suspense } from 'react';

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
