import IngredientsListRoute from '@app/(protected)/admin/content/ingredients/[type]/IngredientsListRoute';
import { capitalize } from '@helpers/formatting/format/format.helper';
import { createDynamicPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createDynamicPageMetadata('type', capitalize);

export default function IngredientsListPage() {
  return (
    <Suspense fallback={null}>
      <IngredientsListRoute />
    </Suspense>
  );
}
