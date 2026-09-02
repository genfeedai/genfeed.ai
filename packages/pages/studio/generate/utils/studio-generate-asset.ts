import {
  type IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type {
  StudioGenerateJob,
  StudioGenerateType,
} from '@pages/studio/generate/types';
import { listStudioGenerateTypeConfigs } from '@pages/studio/generate/utils/studio-generate-types';

const CATEGORY_TO_TYPE = new Map<IngredientCategory, StudioGenerateType>(
  listStudioGenerateTypeConfigs().map((config) => [
    config.ingredientCategory,
    config.type,
  ]),
);

export const STUDIO_GENERATE_CATEGORIES: readonly IngredientCategory[] =
  listStudioGenerateTypeConfigs().map((config) => config.ingredientCategory);

/**
 * Playable/renderable URL for a generated asset. Mirrors the fallback chain
 * the rest of the product uses (`PostsGrid`): CDN first, then the stored
 * ingredient URL, then the thumbnail.
 */
export function resolveStudioAssetUrl(
  ingredient: Pick<
    IIngredient,
    'cdnUrl' | 'ingredientUrl' | 'thumbnailUrl'
  > | null,
): string | undefined {
  if (!ingredient) {
    return undefined;
  }

  return (
    ingredient.cdnUrl ||
    ingredient.ingredientUrl ||
    ingredient.thumbnailUrl ||
    undefined
  );
}

/**
 * Persisted dimensions only. Ingredient model getters intentionally provide
 * portrait defaults for legacy views; using those defaults as real generation
 * metadata makes square assets letterbox inside a false 9:16 masonry tile.
 */
export function resolveStudioAssetDimensions(
  ingredient: Pick<IIngredient, 'height' | 'metadata' | 'width'> | null,
): { height?: number; width?: number } {
  if (!ingredient) {
    return {};
  }

  const metadata =
    typeof ingredient.metadata === 'object' ? ingredient.metadata : undefined;

  return {
    height: metadata?.height || ingredient.height || undefined,
    width: metadata?.width || ingredient.width || undefined,
  };
}

export function resolveStudioTypeFromCategory(
  category: IngredientCategory | string | undefined,
): StudioGenerateType | null {
  if (!category) {
    return null;
  }
  return CATEGORY_TO_TYPE.get(category as IngredientCategory) ?? null;
}

function resolveStatus(value: unknown): IngredientStatus {
  return value === IngredientStatus.FAILED ||
    value === IngredientStatus.PROCESSING ||
    value === IngredientStatus.DRAFT
    ? value
    : IngredientStatus.GENERATED;
}

/**
 * Projects a stored ingredient onto the same job shape the live socket queue
 * produces, so the results grid can render history and in-flight work from one
 * list.
 */
export function toStudioGenerateJob(
  ingredient: IIngredient,
): StudioGenerateJob | null {
  const type = resolveStudioTypeFromCategory(ingredient.category);

  if (!type) {
    return null;
  }

  const createdAt = ingredient.createdAt
    ? new Date(ingredient.createdAt).getTime()
    : 0;
  const dimensions = resolveStudioAssetDimensions(ingredient);

  return {
    createdAt: Number.isNaN(createdAt) ? 0 : createdAt,
    height: dimensions.height,
    id: String(ingredient.id),
    ingredient,
    ingredientId: String(ingredient.id),
    modelKey:
      (typeof ingredient.metadata === 'object'
        ? ingredient.metadata?.model
        : undefined) ||
      ingredient.metadataModel ||
      ingredient.model ||
      undefined,
    prompt: ingredient.promptText || '',
    status: resolveStatus(ingredient.status),
    type,
    url: resolveStudioAssetUrl(ingredient),
    width: dimensions.width,
  };
}

/**
 * Stored rows are authoritative after persistence. The only exception is a
 * socket result that has advanced beyond a still-stale processing response.
 */
export function mergeStudioGenerateJobs(
  liveJobs: readonly StudioGenerateJob[],
  storedJobs: readonly StudioGenerateJob[],
): StudioGenerateJob[] {
  const merged = new Map<string, StudioGenerateJob>();

  for (const job of storedJobs) {
    merged.set(job.id, job);
  }
  for (const job of liveJobs) {
    const storedJob = merged.get(job.id);
    if (!storedJob) {
      merged.set(job.id, job);
      continue;
    }

    const storedIsPending =
      storedJob.status === IngredientStatus.DRAFT ||
      storedJob.status === IngredientStatus.PROCESSING;
    const liveIsPending =
      job.status === IngredientStatus.DRAFT ||
      job.status === IngredientStatus.PROCESSING;

    const mergedJob =
      storedIsPending && !liveIsPending
        ? { ...storedJob, ...job }
        : { ...job, ...storedJob };

    merged.set(job.id, {
      ...mergedJob,
      recipe: job.recipe ?? storedJob.recipe ?? mergedJob.recipe,
      runId: job.runId ?? storedJob.runId ?? mergedJob.runId,
    });
  }

  return Array.from(merged.values()).toSorted(
    (left, right) => right.createdAt - left.createdAt,
  );
}

export function filterStudioGenerateJobs(
  jobs: readonly StudioGenerateJob[],
  filters: { search?: string; type?: StudioGenerateType | 'all' },
): StudioGenerateJob[] {
  const search = filters.search?.trim().toLowerCase() ?? '';
  const type = filters.type ?? 'all';

  return jobs.filter((job) => {
    if (type !== 'all' && job.type !== type) {
      return false;
    }
    if (search && !job.prompt.toLowerCase().includes(search)) {
      return false;
    }
    return true;
  });
}

/**
 * Ingredient id out of a JSON:API single-resource document.
 *
 * `POST /videos/avatar` answers with the serialized ingredient
 * (`{ data: { id, type, attributes } }`) rather than the `pendingIngredientIds`
 * envelope every router-backed generation endpoint returns, so
 * `resolvePendingIds` cannot read it.
 */
export function resolveJsonApiIngredientId(response: unknown): string {
  const data =
    typeof response === 'object' && response !== null && 'data' in response
      ? (response as { data?: unknown }).data
      : response;

  const id =
    typeof data === 'object' && data !== null && 'id' in data
      ? (data as { id?: unknown }).id
      : undefined;

  if (typeof id === 'string' && id) {
    return id;
  }

  if (typeof id === 'number') {
    return String(id);
  }

  throw new Error('Avatar generation response carried no ingredient id');
}
