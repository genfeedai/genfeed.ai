import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import FastlanePageContent from '@pages/studio/fastlane';

export const generateMetadata = createPageMetadata('Fastlane');

export default function StudioFastlanePage() {
  return <FastlanePageContent />;
}
