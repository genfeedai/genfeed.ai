import type { IngredientStatus } from '@genfeedai/contracts';
import { get, post } from './client';
import { flattenSingle, type JsonApiSingleResponse } from './json-api';

export interface Image {
  id: string;
  /**
   * Images are ingredients, so the wire value is the Prisma-backed
   * `IngredientStatus` — SCREAMING_SNAKE, and a finished image is `GENERATED`,
   * not `COMPLETED`.
   *
   * @see .agents/memory/rules/enum_source_of_truth.md
   */
  status: IngredientStatus;
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
  // Must stay `brandId`: CreateImageDto extends CreateIngredientDto, and the
  // global ValidationPipe validates with `whitelist: true`, which silently
  // strips any property the DTO does not declare.
  brandId: string;
  autoSelectModel?: boolean;
  blacklist?: string[];
  brandingMode?: 'brand' | 'off';
  camera?: string;
  fidelityMode?: 'guided' | 'off' | 'strict';
  fontFamily?: string;
  format?: string;
  model?: string;
  height?: number;
  isBrandingEnabled?: boolean;
  lens?: string;
  lighting?: string;
  mood?: string;
  negativePrompt?: string;
  outputs?: number;
  prioritize?: 'balanced' | 'cost' | 'quality' | 'speed';
  promptTemplate?: string;
  references?: string[];
  scene?: string;
  seed?: number;
  style?: string;
  tags?: string[];
  useTemplate?: boolean;
  width?: number;
}

export async function createImage(
  request: CreateImageRequest,
  signal?: AbortSignal
): Promise<Image> {
  const body = request as unknown as Record<string, unknown>;
  const response = signal
    ? await post<JsonApiSingleResponse>('/images', body, { signal })
    : await post<JsonApiSingleResponse>('/images', body);
  return flattenSingle<Image>(response);
}

export async function getImage(id: string): Promise<Image> {
  const response = await get<JsonApiSingleResponse>(`/images/${id}`);
  return flattenSingle<Image>(response);
}
