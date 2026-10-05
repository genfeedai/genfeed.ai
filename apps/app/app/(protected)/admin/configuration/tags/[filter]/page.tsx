import TagsFilterRoute from '@app/(protected)/admin/configuration/tags/[filter]/TagsFilterRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Tags');

export default function TagsFilterPage() {
  return (
    <Suspense fallback={null}>
      <TagsFilterRoute />
    </Suspense>
  );
}
