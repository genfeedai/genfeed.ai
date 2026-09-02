import type { IngredientStatus } from '@genfeedai/contracts';
import { get, post } from './client';
import { flattenSingle, type JsonApiSingleResponse } from './json-api';

export interface Video {
  id: string;
  /**
   * Videos are ingredients, so the wire value is the Prisma-backed
   * `IngredientStatus` — SCREAMING_SNAKE, and a finished video is `GENERATED`,
   * not `COMPLETED`.
   *
   * @see .agents/memory/rules/enum_source_of_truth.md
   */
  status: IngredientStatus;
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

export async function createVideo(
  request: CreateVideoRequest,
  signal?: AbortSignal
): Promise<Video> {
  const body = request as unknown as Record<string, unknown>;
  const response = signal
    ? await post<JsonApiSingleResponse>('/videos', body, { signal })
    : await post<JsonApiSingleResponse>('/videos', body);
  return flattenSingle<Video>(response);
}

export async function getVideo(id: string): Promise<Video> {
  const response = await get<JsonApiSingleResponse>(`/videos/${id}`);
  return flattenSingle<Video>(response);
}
