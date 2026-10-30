import IngredientDetailRoute from '@app/(protected)/admin/content/ingredients/[type]/[id]/IngredientDetailRoute';
import { capitalize } from '@helpers/formatting/format/format.helper';
import { createDynamicPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createDynamicPageMetadata('type', capitalize);

export default function IngredientDetailPage() {
  return (
    <Suspense fallback={null}>
      <IngredientDetailRoute />
    </Suspense>
  );
}
