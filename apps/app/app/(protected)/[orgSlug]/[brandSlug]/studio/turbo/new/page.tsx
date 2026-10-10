import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import OrganizationModulePreferenceGate from '@ui/guards/organization-module/OrganizationModulePreferenceGate';
import TurboNewProjectPage from '@/features/workflows/pages/turbo/TurboNewProjectPage';
export const generateMetadata = createPageMetadata('New Batch');
export default function StudioTurboNewPage() {
  return (
    <OrganizationModulePreferenceGate moduleId="turboRun">
      <TurboNewProjectPage />
    </OrganizationModulePreferenceGate>
  );
}
