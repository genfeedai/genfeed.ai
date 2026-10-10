import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import OrganizationModulePreferenceGate from '@ui/guards/organization-module/OrganizationModulePreferenceGate';

import NewClipProjectPage from './new-clip-project-page';

export const generateMetadata = createPageMetadata('New Clips Project');

export default function StudioClipsNewPage() {
  return (
    <OrganizationModulePreferenceGate moduleId="clips">
      <NewClipProjectPage />
    </OrganizationModulePreferenceGate>
  );
}
