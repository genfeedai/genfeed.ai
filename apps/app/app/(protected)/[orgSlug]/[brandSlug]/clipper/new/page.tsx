import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import OrganizationModulePreferenceGate from '@ui/guards/organization-module/OrganizationModulePreferenceGate';

import NewClipperProjectPage from './new-clipper-project-page';

export const generateMetadata = createPageMetadata('New Clips Project');

export default function StudioClipperNewPage() {
  return (
    <OrganizationModulePreferenceGate moduleId="clipper">
      <NewClipperProjectPage />
    </OrganizationModulePreferenceGate>
  );
}
