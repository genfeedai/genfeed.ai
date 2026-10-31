import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import CamerasPageContent from './cameras-page-content';

export const generateMetadata = createPageMetadata('Cameras');

export default function CamerasPage() {
  return <CamerasPageContent />;
}
