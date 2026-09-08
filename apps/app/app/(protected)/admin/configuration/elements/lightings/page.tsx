import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LightingsPageContent from './lightings-page-content';

export const generateMetadata = createPageMetadata('Lightings');

export default function LightingsPage() {
  return <LightingsPageContent />;
}
