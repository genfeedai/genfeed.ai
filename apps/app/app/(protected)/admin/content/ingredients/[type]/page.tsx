import { PageScope } from '@genfeedai/enums';
import { capitalize } from '@helpers/formatting/format/format.helper';
import { createDynamicPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import IngredientsList from '@pages/ingredients/list/ingredients-list';
import type { IngredientsListPageProps } from '@props/pages/page.props';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createDynamicPageMetadata('type', capitalize);

export default async function IngredientsListPage({
  params,
}: IngredientsListPageProps) {
  const { type } = await params;

  return (
    <Suspense fallback={<PageLoadingState />}>
      <IngredientsList type={type} scope={PageScope.SUPERADMIN} />
    </Suspense>
  );
}
