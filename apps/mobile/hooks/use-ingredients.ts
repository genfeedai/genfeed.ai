import { useCallback } from 'react';
import { useAsyncItem, useAsyncList } from '@/hooks/use-async-data';
import { ApiRequestError } from '@/services/api/base-http.service';
import {
  type DetailCategory,
  type IngredientsQueryOptions,
  ingredientsService,
  type LibraryDetail,
  type LibraryItem,
} from '@/services/api/ingredients.service';
import { loadRequestScope } from '@/services/api/request-scope';

export type {
  DetailCategory,
  IngredientsQueryOptions,
  LibraryDetail,
  LibraryItem,
};

function isDetailCategory(value: string | null): value is DetailCategory {
  return value === 'image' || value === 'video' || value === 'article';
}

export function useIngredients(options: IngredientsQueryOptions = {}) {
  const fetchList = useCallback(
    async (token: string, opts?: IngredientsQueryOptions) => {
      const scope = await loadRequestScope(token);
      return ingredientsService.findAll(token, scope, opts);
    },
    [],
  );

  const result = useAsyncList<LibraryItem, IngredientsQueryOptions>(
    fetchList,
    'ingredients',
    { options },
  );

  return {
    error: result.error,
    ingredients: result.data,
    isLoading: result.isLoading,
    refetch: result.refetch,
  };
}

export function useIngredient(
  id: string | null,
  category: DetailCategory | null,
) {
  const fetchItem = useCallback(
    async (token: string, itemId: string) => {
      if (!isDetailCategory(category)) {
        throw new ApiRequestError(
          404,
          'A content type is required to load this item.',
        );
      }

      const scope = await loadRequestScope(token);
      return ingredientsService.findOne(token, scope, itemId, category);
    },
    [category],
  );

  const result = useAsyncItem<LibraryDetail>(fetchItem, id, 'ingredient');

  return {
    detail: result.data,
    error: result.error,
    isLoading: result.isLoading,
    refetch: result.refetch,
  };
}
