import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AboutContent from './content';

export const generateMetadata = createPageMetadata('About');
export default function About() {
  return <AboutContent />;
}
