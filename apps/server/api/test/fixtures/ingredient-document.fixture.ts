import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';

export function createIngredientDocumentFixture(
  partial: Partial<IngredientDocument> = {},
): IngredientDocument {
  return new IngredientEntity(partial);
}

export function createPaginatedFixture<T>(
  docs: T[],
  overrides: Partial<AggregatePaginateResult<T>> = {},
): AggregatePaginateResult<T> {
  const limit = overrides.limit ?? 10;
  const page = overrides.page ?? 1;
  const totalDocs = overrides.totalDocs ?? docs.length;

  return {
    docs,
    hasNextPage: false,
    hasPrevPage: false,
    limit,
    nextPage: null,
    page,
    pagingCounter: totalDocs === 0 ? 0 : (page - 1) * limit + 1,
    prevPage: null,
    totalDocs,
    totalPages:
      overrides.totalPages ??
      (totalDocs === 0 ? 0 : Math.ceil(totalDocs / limit)),
    ...overrides,
  };
}
