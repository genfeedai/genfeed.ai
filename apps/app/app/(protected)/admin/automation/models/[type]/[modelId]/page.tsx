import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ModelDetailContent from './content';
export const generateMetadata = createPageMetadata('Model details');
export default function ModelDetailPage() {
  return <ModelDetailContent />;
}
