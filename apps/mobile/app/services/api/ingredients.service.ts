import { type ApiResponse, apiRequest } from '@/services/api/base-http.service';

export interface IngredientMetadata {
  title?: string;
  description?: string;
  width?: number;
  height?: number;
  duration?: number;
  wordCount?: number;
  thumbnailUrl?: string;
}

export interface Ingredient {
  id: string;
  type: 'attributes';
  attributes: {
    category: string;
    status: string;
    ingredientUrl?: string;
    metadata?: IngredientMetadata;
    createdAt: string;
    updatedAt: string;
  };
}

export type IngredientsResponse = ApiResponse<Ingredient[]>;
export type IngredientResponse = ApiResponse<Ingredient>;

export interface IngredientsQueryOptions {
  category?: 'image' | 'video' | 'article';
  page?: number;
  pageSize?: number;
}

function getEndpointForCategory(category: string): string {
  return category === 'article' ? 'articles' : `${category}s`;
}

class IngredientsService {
  findAll(
    token: string,
    options?: IngredientsQueryOptions,
  ): Promise<IngredientsResponse> {
    const category = options?.category || 'image';
    const endpoint = getEndpointForCategory(category);

    return apiRequest<IngredientsResponse>(token, endpoint, {
      params: {
        page: options?.page,
        pageSize: options?.pageSize,
      },
    });
  }

  findOne(
    token: string,
    id: string,
    category?: 'image' | 'video' | 'article',
  ): Promise<IngredientResponse> {
    const endpoint = category
      ? getEndpointForCategory(category)
      : 'ingredients';

    return apiRequest<IngredientResponse>(token, `${endpoint}/${id}`);
  }
}

export const ingredientsService = new IngredientsService();
