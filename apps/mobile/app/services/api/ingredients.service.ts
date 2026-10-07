import type {
  IArticle,
  IIngredient,
  IMetadata,
  JsonApiCollectionResponse,
  JsonApiResource,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import { ApiRequestError, apiRequest } from '@/services/api/base-http.service';
import type { RequestScope } from '@/services/api/request-scope';

export type LibraryCategory = 'image' | 'video';
export type DetailCategory = LibraryCategory | 'article';

export type LibraryItem = Omit<Partial<IIngredient>, 'metadata'> & {
  id: string;
  metadata?: Partial<IMetadata> | string;
};
export type ArticleItem = { id: string } & Partial<IArticle>;

export type LibraryDetail =
  | { item: ArticleItem; kind: 'article' }
  | { item: LibraryItem; kind: 'media' };

export interface IngredientsQueryOptions {
  category?: LibraryCategory;
  limit?: number;
  page?: number;
}

const LIST_ENDPOINTS: Record<LibraryCategory, string> = {
  image: 'images',
  video: 'videos',
};

const DETAIL_ENDPOINTS: Record<DetailCategory, string> = {
  article: 'articles',
  image: 'images',
  video: 'videos',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isMetadata(value: unknown): value is Partial<IMetadata> {
  return isRecord(value) && ('label' in value || 'description' in value);
}

function relationshipId(resource: JsonApiResource<unknown>): string | null {
  const relationship = resource.relationships?.metadata?.data;
  if (!relationship || Array.isArray(relationship)) {
    return null;
  }

  return relationship.id;
}

function resolveMetadata(
  resource: JsonApiResource<Partial<IIngredient>>,
  included: JsonApiResource[] | undefined,
): Partial<IMetadata> | undefined {
  const nested = resource.attributes?.metadata;
  if (isMetadata(nested)) {
    return nested;
  }

  const metadataId = relationshipId(resource);
  if (!metadataId || !included) {
    return undefined;
  }

  const match = included.find(
    (entry) => entry.id === metadataId && entry.type === 'metadata',
  );
  return isMetadata(match?.attributes) ? match.attributes : undefined;
}

export function libraryItemsFromResponse(
  response: JsonApiCollectionResponse<Partial<IIngredient>>,
): LibraryItem[] {
  return response.data.map((resource) => {
    const metadata = resolveMetadata(resource, response.included);
    return {
      id: resource.id,
      ...resource.attributes,
      ...(metadata ? { metadata } : {}),
    };
  });
}

function scopeParams(
  scope: RequestScope,
  options?: IngredientsQueryOptions,
): Record<string, string | number | undefined> {
  return {
    brandId: scope.brandId,
    limit: options?.limit,
    organizationId: scope.organizationId,
    page: options?.page,
  };
}

class IngredientsService {
  findAll(
    token: string,
    scope: RequestScope,
    options?: IngredientsQueryOptions,
  ): Promise<{ data: LibraryItem[] }> {
    const category = options?.category ?? 'image';

    return apiRequest<JsonApiCollectionResponse<Partial<IIngredient>>>(
      token,
      LIST_ENDPOINTS[category],
      { params: scopeParams(scope, options) },
    ).then((response) => ({ data: libraryItemsFromResponse(response) }));
  }

  findOne(
    token: string,
    scope: RequestScope,
    id: string,
    category: DetailCategory,
  ): Promise<{ data: LibraryDetail }> {
    const endpoint = DETAIL_ENDPOINTS[category];

    if (category === 'article') {
      return apiRequest<JsonApiSingleResponse<Partial<IArticle>>>(
        token,
        `${endpoint}/${id}`,
        { params: scopeParams(scope) },
      ).then((response) => {
        if (!response.data) {
          throw new ApiRequestError(404, 'That record was not found.');
        }

        return {
          data: {
            item: { id: response.data.id, ...response.data.attributes },
            kind: 'article',
          },
        };
      });
    }

    return apiRequest<JsonApiSingleResponse<Partial<IIngredient>>>(
      token,
      `${endpoint}/${id}`,
      { params: scopeParams(scope) },
    ).then((response) => {
      if (!response.data) {
        throw new ApiRequestError(404, 'That record was not found.');
      }

      const metadata = resolveMetadata(response.data, response.included);
      return {
        data: {
          item: {
            id: response.data.id,
            ...response.data.attributes,
            ...(metadata ? { metadata } : {}),
          },
          kind: 'media',
        },
      };
    });
  }
}

export const ingredientsService = new IngredientsService();
