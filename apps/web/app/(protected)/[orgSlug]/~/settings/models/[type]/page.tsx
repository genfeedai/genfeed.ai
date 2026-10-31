import ModelsTypeRoute from '@app/(protected)/[orgSlug]/~/settings/models/[type]/ModelsTypeRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Models');

export default function ModelsTypePage() {
  return <ModelsTypeRoute />;
}
