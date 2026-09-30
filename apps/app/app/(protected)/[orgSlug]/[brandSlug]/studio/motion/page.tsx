import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import MotionContent from './content';
export const generateMetadata = createPageMetadata('Motion');
export default function StudioMotionPage() {
  return (
    <Suspense fallback={null}>
      <MotionContent />
    </Suspense>
  );
}
