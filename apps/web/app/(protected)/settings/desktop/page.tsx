import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import DesktopContent from './content';

export const generateMetadata = createPageMetadata('Desktop');
export default function Desktop() {
  return <DesktopContent />;
}
