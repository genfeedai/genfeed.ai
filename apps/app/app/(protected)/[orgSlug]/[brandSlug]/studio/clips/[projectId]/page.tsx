import StudioClipProjectRoute from '@app/(protected)/[orgSlug]/[brandSlug]/studio/clips/[projectId]/StudioClipProjectRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Clips');

export default function StudioClipProjectPage() {
  return (
    <Suspense fallback={null}>
      <StudioClipProjectRoute />
    </Suspense>
  );
}
