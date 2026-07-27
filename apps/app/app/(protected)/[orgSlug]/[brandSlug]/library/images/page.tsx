import { PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import IngredientsLayout from '@pages/ingredients/layout/ingredients-layout';
import IngredientsList from '@pages/ingredients/list/ingredients-list';
import { Skeleton } from '@ui/display/skeleton/skeleton';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Images');

function LibraryImagesPageFallback() {
  return (
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
        <IngredientsList
          folderNavigation="shell"
          type="images"
          scope={PageScope.BRAND}
        />
      </Suspense>
    </IngredientsLayout>
  );
}
