import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import OrganizationModulePreferenceGate from '@/components/guards/organization-module/OrganizationModulePreferenceGate';
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
