'use client';

import {
  type IngredientCategorySchema,
  ingredientCategorySchema,
} from '@genfeedai/client/schemas';
import { useIngredientsContext } from '@genfeedai/contexts/content/ingredients-context/ingredients-context';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  IngredientCategory,
  IngredientFormat,
  PageScope,
} from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import {
  isAvatarSourceImageIngredient,
  isAvatarVideoIngredient,
} from '@genfeedai/utils/media/ingredient-type.util';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';

const ingredientFormatValues = new Set<string>(Object.values(IngredientFormat));

export const isIngredientFormat = (
  value?: string | null,
): value is IngredientFormat =>
  typeof value === 'string' && ingredientFormatValues.has(value);

interface UseIngredientsFiltersProps {
  type: string;
  scope: PageScope;
}

export function useIngredientsFilters({
  type,
  scope,
}: UseIngredientsFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );
  const pathname = usePathname();

  const { brandId, organizationId } = useBrand();
  const { filters, query, setQuery, setIsRefreshing, onRefresh } =
    useIngredientsContext();

  const singularType = useMemo(() => type.slice(0, -1), [type]);

  const formatFilter =
    filters.format && filters.format !== 'all' ? filters.format : undefined;

  const isActionsEnabled =
    scope !== PageScope.SUPERADMIN && scope !== PageScope.ORGANIZATION;

  const currentPage = Number(parsedSearchParams.get('page')) || 1;

  const form = useForm<IngredientCategorySchema>({
    defaultValues: {
      status: '',
    },
    resolver: standardSchemaResolver(ingredientCategorySchema),
  });

  const clearFilters = useCallback(() => {
    setQuery({
      category: '',
      format: '',
      provider: '',
      search: '',
      status: '',
    });
  }, [setQuery]);

  const getFilteredIngredients = useCallback(
    (ingredients: IIngredient[]) => ingredients,
    [],
  );

  const getMediaIngredients = useCallback(
    (filteredIngredients: IIngredient[]) =>
      filteredIngredients.filter(
        (ing) =>
          (ing.category === IngredientCategory.IMAGE ||
            ing.category === IngredientCategory.VIDEO ||
            ing.category === IngredientCategory.GIF ||
            isAvatarSourceImageIngredient(ing) ||
            isAvatarVideoIngredient(ing)) &&
          (ing.ingredientUrl || ing.thumbnailUrl),
      ),
    [],
  );

  return {
    brandId,
    clearFilters,
    currentPage,
    form,
    formatFilter,
    getFilteredIngredients,
    getMediaIngredients,
    isActionsEnabled,
    onRefresh,
    organizationId,
    parsedSearchParams,
    pathname,
    query,
    router,
    searchParamsString,
    setIsRefreshing,
    setQuery,
    singularType,
  };
}
