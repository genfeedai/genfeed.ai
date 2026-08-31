import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import FastlanePageContent from '@pages/studio/fastlane';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Fastlane');

export default function StudioFastlanePage() {
  return (
    <Suspense fallback={null}>
      <FastlanePageContent />
    </Suspense>
  );
}
