import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import MotionWorkspace from './components/MotionWorkspace';

export const generateMetadata = createPageMetadata('Motion');

export default function StudioMotionPage() {
  return <MotionWorkspace />;
}
