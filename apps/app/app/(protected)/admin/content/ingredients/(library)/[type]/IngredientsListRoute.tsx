'use client';

import { PageScope } from '@genfeedai/contracts';
import IngredientsList from '@pages/ingredients/list/ingredients-list';
import type { IngredientsListPageProps } from '@props/pages/page.props';

import { useParams } from 'next/navigation';
import { readRouteParam } from '@/lib/route-params';

export default function IngredientsListRoute() {
  const params = useParams<Awaited<IngredientsListPageProps['params']>>();
  const type = readRouteParam(params.type);

  return <IngredientsList type={type} scope={PageScope.SUPERADMIN} />;
}
