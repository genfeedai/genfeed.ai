'use client';

import type { Task } from '@genfeedai/services/management/tasks.service';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { IngredientReviewRequestsService } from '@services/management/ingredient-review-requests.service';

export const INGREDIENT_REVIEW_REQUESTS_QUERY_KEY =
  'ingredient-review-requests';
const INGREDIENT_REVIEW_CANDIDATES_QUERY_KEY = 'ingredient-review-candidates';

const NO_REQUESTS: Task[] = [];

function reviewService(token: string): IngredientReviewRequestsService {
  return IngredientReviewRequestsService.getInstance(token);
}

/** The review requests on one asset that the viewer may see. */
export function useIngredientReviewRequests(ingredientId: string | undefined): {
  isLoading: boolean;
  requests: Task[];
} {
  const query = useAuthedQuery<IngredientReviewRequestsService, Task[]>({
    enabled: Boolean(ingredientId),
    queryFn: (service, signal) =>
      service.listForIngredient(ingredientId ?? '', signal),
    queryKey: [INGREDIENT_REVIEW_REQUESTS_QUERY_KEY, ingredientId ?? null],
    service: reviewService,
  });

  return { isLoading: query.isLoading, requests: query.data ?? NO_REQUESTS };
}

/**
 * The teammates who can be asked to review every one of the assets: members
 * who reach each asset's brand. The server decides, one asset per brand is
 * enough because access follows the brand.
 */
export function useIngredientReviewCandidates(
  representativeIngredientIds: readonly string[],
  isEnabled: boolean,
): { isLoading: boolean; reviewerUserIds: ReadonlySet<string> | null } {
  const query = useAuthedQuery<IngredientReviewRequestsService, string[]>({
    enabled: isEnabled && representativeIngredientIds.length > 0,
    queryFn: async (service, signal) => {
      const lists = await Promise.all(
        representativeIngredientIds.map((id) =>
          service.listCandidates(id, signal),
        ),
      );
      const [first = [], ...rest] = lists;
      return first.filter((userId) =>
        rest.every((list) => list.includes(userId)),
      );
    },
    queryKey: [
      INGREDIENT_REVIEW_CANDIDATES_QUERY_KEY,
      [...representativeIngredientIds].sort(),
    ],
    service: reviewService,
  });

  return {
    isLoading: query.isLoading,
    reviewerUserIds: query.data ? new Set(query.data) : null,
  };
}
