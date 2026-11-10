'use client';

import type { IIngredient, IPost } from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import { useEffect } from 'react';

const EMPTY_POSTS: IPost[] = [];
const EMPTY_CHILDREN: IIngredient[] = [];

function createIngredientsService(token: string): IngredientsService {
  return IngredientsService.getInstance(token);
}

/**
 * The posts an asset is used in and the assets made from it: the same
 * per-ingredient caches the library's Posts and Children tabs use.
 */
export function useStudioInspectorRelations(
  ingredientId: string | undefined,
  isSourceUnavailable: boolean,
) {
  const isRelationsReadEnabled = Boolean(ingredientId) && !isSourceUnavailable;
  const postsQuery = useAuthedQuery({
    enabled: isRelationsReadEnabled,
    queryFn: async (service) => {
      if (!ingredientId) {
        throw new Error('studio_inspector_ingredient_required');
      }
      return await service.getPosts(ingredientId);
    },
    queryKey: ['ingredient-posts', ingredientId ?? null],
    service: createIngredientsService,
  });
  const childrenQuery = useAuthedQuery({
    enabled: isRelationsReadEnabled,
    queryFn: async (service) => {
      if (!ingredientId) {
        throw new Error('studio_inspector_ingredient_required');
      }
      return await service.findChildren(ingredientId);
    },
    queryKey: ['ingredient-children', ingredientId ?? null],
    service: createIngredientsService,
  });
  const posts: IPost[] = isRelationsReadEnabled
    ? (postsQuery.data ?? EMPTY_POSTS)
    : EMPTY_POSTS;
  const children: IIngredient[] = isRelationsReadEnabled
    ? (childrenQuery.data ?? EMPTY_CHILDREN)
    : EMPTY_CHILDREN;
  const isLoadingUsedIn = isRelationsReadEnabled && postsQuery.isLoading;
  const isLoadingHistory = isRelationsReadEnabled && childrenQuery.isLoading;
  const postsError = postsQuery.error;
  const childrenError = childrenQuery.error;
  useEffect(() => {
    if (postsError) {
      logger.error('Failed to load Studio inspector posts', postsError);
    }
  }, [postsError]);
  useEffect(() => {
    if (childrenError) {
      logger.error('Failed to load Studio inspector history', childrenError);
    }
  }, [childrenError]);
  return { children, isLoadingHistory, isLoadingUsedIn, posts };
}
