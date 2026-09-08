import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import CameraMovementsPageContent from './camera-movements-page-content';

export const generateMetadata = createPageMetadata('Camera Movements');

export default function CameraMovementsPage() {
  return <CameraMovementsPageContent />;
}
