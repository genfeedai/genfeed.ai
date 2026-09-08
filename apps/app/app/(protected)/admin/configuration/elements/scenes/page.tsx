import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ScenesPageContent from './scenes-page-content';

export const generateMetadata = createPageMetadata('Scenes');

export default function ScenesPage() {
  return <ScenesPageContent />;
}
