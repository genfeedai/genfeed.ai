import { useAsyncItem, useAsyncList } from '@/hooks/use-async-data';
import {
  type Ingredient,
  type IngredientsQueryOptions,
  ingredientsService,
} from '@/services/api/ingredients.service';

export type { Ingredient, IngredientsQueryOptions };

export function useIngredients(options: IngredientsQueryOptions = {}) {
  const result = useAsyncList<Ingredient, IngredientsQueryOptions>(
    (token, opts) => ingredientsService.findAll(token, opts),
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

export function useIngredient(id: string | null) {
  const result = useAsyncItem<Ingredient>(
    (token, itemId) => ingredientsService.findOne(token, itemId),
    id,
    'ingredient',
  );

  return {
    error: result.error,
    ingredient: result.data,
    isLoading: result.isLoading,
  };
}
