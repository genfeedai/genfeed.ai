import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import OrganizationModulePreferenceGate from '@ui/guards/organization-module/OrganizationModulePreferenceGate';
import BatchNewProjectPage from '@/features/workflows/pages/batch/BatchNewProjectPage';
export const generateMetadata = createPageMetadata('New Batch');
export default function StudioBatchNewPage() {
  return (
    <OrganizationModulePreferenceGate moduleId="batch">
      <BatchNewProjectPage />
    </OrganizationModulePreferenceGate>
  );
}
