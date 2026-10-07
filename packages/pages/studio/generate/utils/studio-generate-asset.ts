import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type {
  AgentContentMentionItem,
  IIngredient,
} from '@genfeedai/contracts/interfaces';
import type {
  StudioGenerateAssetFacts,
  StudioGenerateJob,
  StudioGenerateReferenceRole,
  StudioGenerateType,
} from '@pages/studio/generate/types';
import { resolveAspectRatioFromDimensions } from '@pages/studio/generate/utils/studio-generate-recipe';
import { listStudioGenerateTypeConfigs } from '@pages/studio/generate/utils/studio-generate-types';

const CATEGORY_TO_TYPE = new Map<IngredientCategory, StudioGenerateType>([
  ...listStudioGenerateTypeConfigs()
    .filter((config) => config.type !== 'image-edit')
    .map((config) => [config.ingredientCategory, config.type] as const),
  // A GIF is produced from a Generate video and renders as an image card,
  // with the masonry's own GIF eligibility rules.
  [IngredientCategory.GIF, 'image'],
]);

export const STUDIO_GENERATE_CATEGORIES: readonly IngredientCategory[] = [
  ...new Set(
    listStudioGenerateTypeConfigs().map((config) => config.ingredientCategory),
  ),
];

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

const STUDIO_REFERENCE_READY_STATUSES = new Set<IngredientStatus>([
  IngredientStatus.GENERATED,
  IngredientStatus.UPLOADED,
  IngredientStatus.VALIDATED,
]);

/** A clip the video composer can attach as a video reference. */
export function isStudioVideoReferenceJob(
  job: Pick<StudioGenerateJob, 'type'>,
): boolean {
  return job.type === 'video' || job.type === 'avatar';
}

/**
 * Role a ready gallery asset takes in the composer that is already open.
 * The composer type stays put: an image on a video prompt is a start frame,
 * and a clip is a video reference.
 */
export function studioReferenceRoleForJob(
  job: Pick<StudioGenerateJob, 'type'>,
  composerType: StudioGenerateType,
): StudioGenerateReferenceRole | null {
  const isVideo = isStudioVideoReferenceJob(job);
  if (composerType === 'video') {
    if (job.type === 'music' || job.type === 'voice') {
      return null;
    }
    return isVideo ? 'videoReference' : 'startFrame';
  }
  if (isVideo || job.type === 'music' || job.type === 'voice') {
    return null;
  }
  if (composerType === 'image-edit') {
    return 'editSource';
  }
  if (composerType === 'image') {
    return 'reference';
  }
  return null;
}

/**
 * Whether the open composer can accept this gallery asset. Model limits that
 * reject a start frame or a video reference hide the action the same way an
 * incompatible composer type does.
 */
export function canUseStudioJobAsReference(
  job: Pick<StudioGenerateJob, 'type'>,
  composerType: StudioGenerateType,
  constraints: {
    isStartFrameSupported: boolean;
    isVideoReferenceSupported: boolean;
  },
): boolean {
  const role = studioReferenceRoleForJob(job, composerType);
  if (!role) {
    return false;
  }
  if (role === 'videoReference' && !constraints.isVideoReferenceSupported) {
    return false;
  }
  if (role === 'startFrame' && !constraints.isStartFrameSupported) {
    return false;
  }
  return true;
}

/**
 * Attach `next`, or replace the stored role when the same asset is already
 * attached. A start or end frame still occupies the single slot for that role.
 */
export function replaceStudioContentReference<
  T extends { item: { id: string }; role: StudioGenerateReferenceRole },
>(current: T[], next: T, supportsInterpolation: boolean): T[] {
  const existing = current.find(
    (reference) => reference.item.id === next.item.id,
  );
  if (existing?.role === next.role) {
    return current;
  }

  const withoutItem = current.filter(
    (reference) => reference.item.id !== next.item.id,
  );
  if (next.role === 'endFrame' || next.role === 'startFrame') {
    return [
      ...withoutItem.filter(
        (reference) =>
          reference.role !== next.role &&
          (supportsInterpolation ||
            (reference.role !== 'startFrame' && reference.role !== 'endFrame')),
      ),
      next,
    ];
  }

  return [...withoutItem, next];
}

/** Gallery row the reference picker can show. Posts stay a separate source. */
export function studioJobToContentMention(
  job: StudioGenerateJob,
): AgentContentMentionItem | null {
  if (
    !STUDIO_REFERENCE_READY_STATUSES.has(job.status) ||
    job.type === 'music' ||
    job.type === 'voice'
  ) {
    return null;
  }

  const previewUrl = job.ingredient
    ? resolveStudioAssetUrl(job.ingredient) || job.url
    : job.url;
  const id = job.ingredient?.id || job.ingredientId;
  if (!previewUrl || !id) {
    return null;
  }

  return {
    brandId: job.ingredient?.brandId ?? null,
    contentTitle:
      job.ingredient?.metadataLabel ||
      job.ingredient?.promptText ||
      job.prompt ||
      'Generated reference',
    contentType: isStudioVideoReferenceJob(job) ? 'video' : 'image',
    id: String(id),
    thumbnailUrl: previewUrl,
  };
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

function toValidDate(value: number | string | undefined): Date | undefined {
  if (value === undefined || value === '' || value === 0) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * The facts the asset panel lists for a generation. Only persisted metadata
 * and the recipe that actually left Studio count: the `Ingredient` model's
 * getters invent defaults (8s, 1080×1920) that must never read as real facts.
 */
export function resolveStudioAssetFacts(
  job: StudioGenerateJob,
): StudioGenerateAssetFacts {
  const ingredient = job.ingredient ?? null;
  const metadata =
    ingredient && typeof ingredient.metadata === 'object'
      ? ingredient.metadata
      : undefined;
  const submittedRecipe = job.recipe;
  const { height, width } = resolveStudioAssetDimensions(ingredient);
  const resolvedWidth = width ?? job.width;
  const resolvedHeight = height ?? job.height;
  const brand = ingredient?.brand;
  const durationSeconds = submittedRecipe?.duration ?? metadata?.duration;

  return {
    aspectRatio:
      submittedRecipe?.aspectRatio ||
      (resolvedWidth && resolvedHeight
        ? (resolveAspectRatioFromDimensions(resolvedWidth, resolvedHeight) ??
          `${resolvedWidth}×${resolvedHeight}`)
        : undefined),
    brandLabel:
      brand && typeof brand === 'object' ? brand.label || undefined : undefined,
    createdAt: toValidDate(ingredient?.createdAt) ?? toValidDate(job.createdAt),
    durationSeconds:
      durationSeconds && durationSeconds > 0 ? durationSeconds : undefined,
    modelLabel:
      metadata?.modelLabel ||
      metadata?.model ||
      job.modelKey ||
      submittedRecipe?.modelKey ||
      undefined,
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
  const type = ingredient.imageEdit
    ? 'image-edit'
    : resolveStudioTypeFromCategory(ingredient.category);

  if (!type) {
    return null;
  }

  const createdAt = ingredient.createdAt
    ? new Date(ingredient.createdAt).getTime()
    : 0;
  const dimensions = resolveStudioAssetDimensions(ingredient);

  return {
    createdAt: Number.isNaN(createdAt) ? 0 : createdAt,
    error: ingredient.generationError ?? undefined,
    phase:
      ingredient.generationError === 'Cancelled by user'
        ? 'cancelled'
        : undefined,
    height: dimensions.height,
    id: String(ingredient.id),
    ingredient,
    ingredientId: String(ingredient.id),
    parentId: ingredient.parentId ?? undefined,
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
