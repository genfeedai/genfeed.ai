import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import type { Ingredient } from '@models/content/ingredient.model';
import type { Post } from '@models/content/post.model';
import { PublicService } from '@services/external/public.service';
import { cache } from 'react';

export const getPublicIngredientByIdCached = cache(
  async (id: string): Promise<Ingredient | null> => {
    return await PublicService.getInstance().getPublicIngredient(id);
  },
);

export const getPublicIngredientPostsPageData = cache(
  async (
    id: string,
    page: number,
  ): Promise<{
    ingredient: Ingredient | null;
    postsPage: IPaginatedResponse<Post>;
  }> => {
    const publicService = PublicService.getInstance();

    const [ingredient, postsPage] = await Promise.all([
      getPublicIngredientByIdCached(id),
      publicService.findPublicPostsPage({
        ingredient: id,
        limit: ITEMS_PER_PAGE,
        page,
        sort: 'createdAt: -1',
      }),
    ]);

    return {
      ingredient,
      postsPage,
    };
  },
);
