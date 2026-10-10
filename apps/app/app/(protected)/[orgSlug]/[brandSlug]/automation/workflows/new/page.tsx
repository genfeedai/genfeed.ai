import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import OrganizationModulePreferenceGate from '@ui/guards/organization-module/OrganizationModulePreferenceGate';
import WorkflowNewPageClient from './WorkflowNewPageClient';

export const generateMetadata = createPageMetadata('Agent Workflow Editor');

export default function WorkflowNewPage() {
  return (
    <OrganizationModulePreferenceGate moduleId="automation">
      <WorkflowNewPageClient />
    </OrganizationModulePreferenceGate>
  );
}
