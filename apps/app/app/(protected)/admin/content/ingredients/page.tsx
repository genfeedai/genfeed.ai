import FilteredListRoute from '@app/(protected)/admin/content/ingredients/FilteredListRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Assets');

export default function FilteredListPage() {
  return (
    <Suspense fallback={null}>
      <FilteredListRoute />
    </Suspense>
  );
}
