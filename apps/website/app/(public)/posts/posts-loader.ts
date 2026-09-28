import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import type { Ingredient } from '@models/content/ingredient.model';
import { PublicService } from '@services/external/public.service';
import { cache } from 'react';

export const getPublicIngredientsPageCached = cache(
  async (page: number): Promise<IPaginatedResponse<Ingredient>> => {
    return await PublicService.getInstance().findPublicIngredientsPage({
      limit: ITEMS_PER_PAGE,
      page,
      sort: 'createdAt: -1',
    });
  },
);
