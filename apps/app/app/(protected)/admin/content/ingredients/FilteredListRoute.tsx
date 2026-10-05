'use client';

import { PageScope } from '@genfeedai/contracts';
import IngredientsList from '@pages/ingredients/list/ingredients-list';

import { useSearchParams } from 'next/navigation';

export default function FilteredListRoute() {
  const searchParams = useSearchParams();
  const valueValues = searchParams.getAll('assetType');
  const value = valueValues.length > 1 ? valueValues : valueValues[0];
  const selected =
    value === 'images' ||
    value === 'gifs' ||
    value === 'musics' ||
    value === 'avatars' ||
    value === 'voices' ||
    value === 'ingredients'
      ? value
      : 'videos';
  return <IngredientsList type={selected} scope={PageScope.SUPERADMIN} />;
}
