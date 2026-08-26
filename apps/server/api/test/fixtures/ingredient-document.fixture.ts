import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import type { MetadataDocument } from '@api/collections/metadata/schemas/metadata.schema';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';

export function createIngredientDocumentFixture(
  partial: Partial<IngredientDocument> = {},
): IngredientEntity {
  return new IngredientEntity(partial);
}

export function createMetadataDocumentFixture(
  partial: Partial<MetadataDocument> = {},
): MetadataDocument {
  return new MetadataEntity(partial);
}

export function createPaginatedFixture<T>(
  docs: T[],
  overrides: Partial<AggregatePaginateResult<T>> = {},
): AggregatePaginateResult<T> {
  const limit = overrides.limit ?? 10;
  const page = overrides.page ?? 1;
  const totalDocs = overrides.totalDocs ?? docs.length;

  return {
    ...overrides,
    docs,
    hasNextPage: overrides.hasNextPage ?? false,
    hasPrevPage: overrides.hasPrevPage ?? false,
    limit,
    nextPage: overrides.nextPage ?? null,
    page,
    pagingCounter:
      overrides.pagingCounter ?? (totalDocs === 0 ? 0 : (page - 1) * limit + 1),
    prevPage: overrides.prevPage ?? null,
    totalDocs,
    totalPages:
      overrides.totalPages ??
      (totalDocs === 0 ? 0 : Math.ceil(totalDocs / limit)),
  };
}
