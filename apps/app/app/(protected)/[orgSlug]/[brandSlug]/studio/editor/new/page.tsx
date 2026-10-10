import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import OrganizationModulePreferenceGate from '@ui/guards/organization-module/OrganizationModulePreferenceGate';
import NewEditorProjectPage from './new-editor-project-page';

export const generateMetadata = createPageMetadata('New Project');

export default function EditorNewPage() {
  return (
    <OrganizationModulePreferenceGate moduleId="editor">
      <NewEditorProjectPage />
    </OrganizationModulePreferenceGate>
  );
}
