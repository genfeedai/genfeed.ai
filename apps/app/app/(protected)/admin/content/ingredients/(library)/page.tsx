import { PageScope } from '@genfeedai/contracts';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import IngredientsList from '@pages/ingredients/list/ingredients-list';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Assets');

export default function IngredientsRootPage() {
  return (
    <Suspense fallback={null}>
      <IngredientsList type="ingredients" scope={PageScope.SUPERADMIN} />
    </Suspense>
  );
}
