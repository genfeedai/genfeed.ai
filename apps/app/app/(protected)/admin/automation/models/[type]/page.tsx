import ModelsTypeRoute from '@app/(protected)/admin/automation/models/[type]/ModelsTypeRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Models');

export default function ModelsTypePage() {
  return <ModelsTypeRoute />;
}
