import {
  IngredientCategory,
  LIBRARY_OUTPUT_ORIGINS,
} from '@genfeedai/contracts';
import type {
  IIngredient,
  IPaginatedResponse,
  IQueryParams,
} from '@genfeedai/contracts/interfaces';
import type { Ingredient } from '@genfeedai/models/content/ingredient.model';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { OrganizationLibraryPageParam } from '@/features/admin/props/organization-library.props';

const ORGANIZATION_LIBRARY_PAGE_SIZE = 48;

/** The masonry shows pictures and clips; the Library's other categories have no tile. */
const ORGANIZATION_LIBRARY_CATEGORIES: IngredientCategory[] = [
  IngredientCategory.IMAGE,
  IngredientCategory.VIDEO,
  IngredientCategory.GIF,
];

function resolveNextPage(
  result: IPaginatedResponse<Ingredient>,
): OrganizationLibraryPageParam {
  if (result.nextCursor) {
    return { cursor: result.nextCursor };
  }
  if (result.nextCursor === undefined && result.hasNext) {
    return { page: result.page + 1 };
  }
  return null;
}

/**
 * The content one organization has generated, newest first: the same unified
 * `GET /ingredients` list the in-app Library reads, narrowed to the
 * organization on screen (a platform-admin read) and to generated output.
 */
export function useOrganizationLibrary(organizationId: string | null) {
  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  const query = useInfiniteQuery<
    IPaginatedResponse<Ingredient>,
    Error,
    IPaginatedResponse<Ingredient>[],
    readonly [string, string | null],
    OrganizationLibraryPageParam
  >({
    enabled: Boolean(organizationId),
    getNextPageParam: (lastPage) => resolveNextPage(lastPage),
    initialPageParam: null,
    queryFn: async ({ pageParam, signal }) => {
      const service = await getIngredientsService();
      const listQuery: IQueryParams = {
        allBrands: true,
        categories: ORGANIZATION_LIBRARY_CATEGORIES,
        lightweight: true,
        limit: ORGANIZATION_LIBRARY_PAGE_SIZE,
        organizationId: organizationId ?? undefined,
        origins: [...LIBRARY_OUTPUT_ORIGINS],
        paging: 'cursor',
        sort: 'createdAt: -1',
        ...(pageParam ?? {}),
      };
      return service.findAllPage(listQuery, signal);
    },
    queryKey: ['organization-library', organizationId],
    select: (data) => data.pages,
  });

  const items = useMemo<IIngredient[]>(() => {
    const seen = new Set<string>();
    const unique: IIngredient[] = [];
    for (const page of query.data ?? []) {
      for (const ingredient of page.items) {
        if (!seen.has(ingredient.id)) {
          seen.add(ingredient.id);
          unique.push(ingredient);
        }
      }
    }
    return unique;
  }, [query.data]);

  return {
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isError: query.isError,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    items,
    refetch: query.refetch,
  };
}
