import AdminModelsPageContent from '@app/(protected)/admin/automation/models/[type]/admin-models-page-content';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Models');

export default function ModelsRootPage() {
  return <AdminModelsPageContent type="active" />;
}
