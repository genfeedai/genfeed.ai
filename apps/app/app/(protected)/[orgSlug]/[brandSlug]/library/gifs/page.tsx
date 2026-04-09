import { PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import IngredientsLayout from '@pages/ingredients/layout/ingredients-layout';
import IngredientsList from '@pages/ingredients/list/ingredients-list';
import { SkeletonLoadingFallback } from '@ui/loading/skeleton/SkeletonFallbacks';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('GIFs');

export default function LibraryGifsPage() {
  return (
    <IngredientsLayout scope={PageScope.BRAND} defaultType="gifs" hideTypeTabs>
      <Suspense
        fallback={<SkeletonLoadingFallback type="masonry" count={12} />}
      >
        <IngredientsList type="gifs" scope={PageScope.BRAND} />
      </Suspense>
    </IngredientsLayout>
  );
}
