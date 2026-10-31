import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import BrandKitPage from '../content';

export const generateMetadata = createPageMetadata('Brand Kit');

// The layout renders the Brand Kit and ignores `children`, so switching
// between Overview, Visual, Voice and Strategy changes the path without
// remounting the editor (and losing unsaved revision edits).
export default function BrandKitLayout() {
  return (
    <Suspense fallback={null}>
      <BrandKitPage />
    </Suspense>
  );
}
