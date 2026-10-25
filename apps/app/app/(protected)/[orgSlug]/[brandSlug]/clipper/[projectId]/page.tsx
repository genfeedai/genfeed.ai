import StudioClipperProjectRoute from '@app/(protected)/[orgSlug]/[brandSlug]/clipper/[projectId]/StudioClipperProjectRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Clipper');

export default function StudioClipperProjectPage() {
  return (
    <Suspense fallback={null}>
      <StudioClipperProjectRoute />
    </Suspense>
  );
}
