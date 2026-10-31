import TemplateDetailRoute from '@app/(protected)/admin/content/templates/[id]/TemplateDetailRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Template Detail');

export default function TemplateDetailPage() {
  return <TemplateDetailRoute />;
}
