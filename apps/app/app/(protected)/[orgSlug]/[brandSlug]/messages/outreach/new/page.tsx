import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { OutreachCampaignWizard } from '@pages/agents';
import OrganizationModulePreferenceGate from '@ui/guards/organization-module/OrganizationModulePreferenceGate';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('New outreach sequence');

export default function OutreachSequenceNewRoute() {
  return (
    <OrganizationModulePreferenceGate moduleId="messages">
      <Suspense fallback={null}>
        <OutreachCampaignWizard />
      </Suspense>
    </OrganizationModulePreferenceGate>
  );
}
