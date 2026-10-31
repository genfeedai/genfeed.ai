import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import MoodsPageContent from './moods-page-content';

export const generateMetadata = createPageMetadata('Moods');

export default function MoodsPage() {
  return <MoodsPageContent />;
}
