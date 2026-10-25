import ModelsTypePageClientContent from '@app/(protected)/[orgSlug]/~/settings/models/[type]/page-content';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Models');

export default function ModelsCatalogPage() {
  return <ModelsTypePageClientContent type="all" />;
}
