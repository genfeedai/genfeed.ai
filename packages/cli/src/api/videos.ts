import { get, post } from './client';
import { flattenSingle, type JsonApiSingleResponse } from './json-api';

export type VideoStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Video {
  id: string;
  status: VideoStatus;
  text?: string;
  model: string;
  duration?: number;
  resolution?: string;
  url?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface CreateVideoRequest {
  text: string;
  // Must stay `brandId`: CreateVideoDto extends CreateIngredientDto, and the
  // global ValidationPipe validates with `whitelist: true`, which silently
  // strips any property the DTO does not declare.
  brandId: string;
  model?: string;
  duration?: number;
  resolution?: string;
}

export async function createVideo(request: CreateVideoRequest): Promise<Video> {
  const response = await post<JsonApiSingleResponse>(
    '/videos',
    request as unknown as Record<string, unknown>
  );
  return flattenSingle<Video>(response);
}

export async function getVideo(id: string): Promise<Video> {
  const response = await get<JsonApiSingleResponse>(`/videos/${id}`);
  return flattenSingle<Video>(response);
}
