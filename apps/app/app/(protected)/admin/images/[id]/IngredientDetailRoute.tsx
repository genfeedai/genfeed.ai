'use client';

import IngredientDetail from '@pages/ingredients/detail/ingredient-detail';
import type { IngredientDetailPageProps } from '@props/content/ingredient.props';

import { useParams } from 'next/navigation';
import { readRouteParam } from '@/lib/route-params';

export default function IngredientDetailRoute() {
  const params = useParams<Awaited<IngredientDetailPageProps['params']>>();
  const id = readRouteParam(params.id);

  return <IngredientDetail type={'images'} id={id} />;
}
