import { get, post } from './client.js';
import { flattenSingle, type JsonApiSingleResponse } from './json-api.js';

export type ImageStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Image {
  id: string;
  status: ImageStatus;
  text?: string;
  model: string;
  width?: number;
  height?: number;
  url?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface CreateImageRequest {
  text: string;
  brand: string;
  model?: string;
  width?: number;
  height?: number;
}

export async function createImage(request: CreateImageRequest): Promise<Image> {
  const response = await post<JsonApiSingleResponse>(
    '/images',
    request as unknown as Record<string, unknown>
  );
  return flattenSingle<Image>(response);
}

export async function getImage(id: string): Promise<Image> {
  const response = await get<JsonApiSingleResponse>(`/images/${id}`);
  return flattenSingle<Image>(response);
}
