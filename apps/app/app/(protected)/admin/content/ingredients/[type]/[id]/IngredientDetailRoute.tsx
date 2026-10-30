'use client';

import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import type { IngredientDetailPageProps } from '@props/content/ingredient.props';
import { notFound } from 'next/navigation';
import IngredientDetail from '@/features/ingredients/detail/ingredient-detail';
import { readRouteParam } from '@/lib/route-params';

const DETAIL_TYPES = new Set(['images', 'videos']);

export default function IngredientDetailRoute() {
  const params = useRouteParams<Awaited<IngredientDetailPageProps['params']>>();
  const type = readRouteParam(params.type);
  const id = readRouteParam(params.id);

  if (!DETAIL_TYPES.has(type)) {
    notFound();
  }

  return <IngredientDetail type={type} id={id} />;
}
