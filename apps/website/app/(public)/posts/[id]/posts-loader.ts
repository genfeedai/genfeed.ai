import { ITEMS_PER_PAGE } from '@genfeedai/constants';
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
    posts: Post[];
  }> => {
    const publicService = PublicService.getInstance();

    const [ingredient, posts] = await Promise.all([
      getPublicIngredientByIdCached(id),
      publicService.findPublicPosts({
        ingredient: id,
        limit: ITEMS_PER_PAGE,
        page,
        sort: 'createdAt: -1',
      }),
    ]);

    return {
      ingredient,
      posts,
    };
  },
);
