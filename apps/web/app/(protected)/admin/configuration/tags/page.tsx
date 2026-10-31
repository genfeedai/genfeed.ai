import FilteredListRoute from '@app/(protected)/admin/configuration/tags/FilteredListRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Tags');

export default function FilteredListPage() {
  return (
    <Suspense fallback={null}>
      <FilteredListRoute />
    </Suspense>
  );
}
