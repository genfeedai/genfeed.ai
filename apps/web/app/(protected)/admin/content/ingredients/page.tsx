import IngredientsListRoute from '@app/(protected)/admin/content/ingredients/[type]/IngredientsListRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Assets');

export default function IngredientsRootPage() {
  return (
    <Suspense fallback={null}>
      <IngredientsListRoute />
    </Suspense>
  );
}
