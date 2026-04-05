import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import IngredientsLayout from '@pages/ingredients/layout/ingredients-layout';
import IngredientsList from '@pages/ingredients/list/ingredients-list';
import { SkeletonLoadingFallback } from '@ui/loading/skeleton/SkeletonFallbacks';
import { PageScope } from '@ui-constants/misc.constant';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Music');

export default function LibraryMusicPage() {
  return (
    <IngredientsLayout
      scope={PageScope.BRAND}
      defaultType="musics"
      hideTypeTabs
    >
      <Suspense
        fallback={<SkeletonLoadingFallback type="masonry" count={12} />}
      >
        <IngredientsList type="musics" scope={PageScope.BRAND} />
      </Suspense>
    </IngredientsLayout>
  );
}
