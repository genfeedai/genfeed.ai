import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import OrganizationModulePreferenceGate from '@ui/guards/organization-module/OrganizationModulePreferenceGate';
import { Suspense } from 'react';
import { OutreachCampaignWizard } from '@/features/agents';

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
