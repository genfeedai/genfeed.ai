'use client';

import type { IngredientDetailPageProps } from '@props/content/ingredient.props';
import { notFound, useParams } from 'next/navigation';
import IngredientDetail from '@/features/ingredients/detail/ingredient-detail';
import { readRouteParam } from '@/lib/route-params';

const DETAIL_TYPES = new Set(['images', 'videos']);

export default function IngredientDetailRoute() {
  const params = useParams<Awaited<IngredientDetailPageProps['params']>>();
  const type = readRouteParam(params.type);
  const id = readRouteParam(params.id);

  if (!DETAIL_TYPES.has(type)) {
    notFound();
  }

  return <IngredientDetail type={type} id={id} />;
}
