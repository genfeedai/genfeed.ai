import FilteredListRoute from '@app/(protected)/[orgSlug]/~/settings/models/FilteredListRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Models');

export default function FilteredListPage() {
  return (
    <Suspense fallback={null}>
      <FilteredListRoute />
    </Suspense>
  );
}
