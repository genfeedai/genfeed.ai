import { PageScope } from '@genfeedai/contracts';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import IngredientsList from '@pages/ingredients/list/ingredients-list';
import type { FilterPageProps } from '@props/pages/page.props';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Assets');

export default async function FilteredListPage({
  searchParams,
}: FilterPageProps) {
  const { assetType: value } = await searchParams;
  const selected =
    value === 'images' ||
    value === 'gifs' ||
    value === 'musics' ||
    value === 'avatars' ||
    value === 'voices' ||
    value === 'ingredients'
      ? value
      : 'videos';
  return (
    <Suspense fallback={null}>
      <IngredientsList type={selected} scope={PageScope.SUPERADMIN} />
    </Suspense>
  );
}
