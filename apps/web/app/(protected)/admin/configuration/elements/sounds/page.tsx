import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SoundsPageContent from './sounds-page-content';

export const generateMetadata = createPageMetadata('Sounds');

export default function SoundsPage() {
  return <SoundsPageContent />;
}
