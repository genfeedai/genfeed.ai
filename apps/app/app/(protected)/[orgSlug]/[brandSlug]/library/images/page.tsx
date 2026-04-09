import { PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import IngredientsLayout from '@pages/ingredients/layout/ingredients-layout';
import IngredientsList from '@pages/ingredients/list/ingredients-list';
import { Skeleton } from '@ui/display/skeleton/skeleton';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Images');

function LibraryImagesPageFallback() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(13rem,14rem)_minmax(0,1fr)]">
      <div className="space-y-3">
        <Skeleton className="h-5 w-20 rounded" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, index) => `row-${index + 1}`).map(
            (key) => (
              <Skeleton key={key} className="h-11 w-full rounded-lg" />
            ),
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }, (_, index) => `tile-${index + 1}`).map(
          (key) => (
            <Skeleton
              key={key}
              className="aspect-[4/5] w-full rounded-lg"
              variant="rounded"
            />
          ),
        )}
      </div>
    </div>
  );
}

export default function LibraryImagesPage() {
  return (
    <IngredientsLayout
      scope={PageScope.BRAND}
      defaultType="images"
      hideTypeTabs
    >
      <Suspense fallback={<LibraryImagesPageFallback />}>
        <IngredientsList type="images" scope={PageScope.BRAND} />
      </Suspense>
    </IngredientsLayout>
  );
}
