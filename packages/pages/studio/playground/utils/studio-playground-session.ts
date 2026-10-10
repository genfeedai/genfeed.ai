import { IngredientStatus } from '@genfeedai/contracts';
import { isEntityId } from '@genfeedai/contracts/api-types';
import { readImageEditingRecipe } from '@genfeedai/contracts/constants';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import type {
  StudioPlaygroundJob,
  StudioPlaygroundRecipe,
  StudioPlaygroundType,
} from '@pages/studio/playground/types';
import { readStudioCrunRecipeControls } from './studio-playground-recipe';
import { isStudioPlaygroundType } from './studio-playground-types';

export const STUDIO_PLAYGROUND_SESSION_KEY =
  'genfeed.studio.generate.session.v1';
export const STUDIO_PLAYGROUND_SESSION_LIMIT = 48;

const SESSION_STATUSES = new Set<string>(Object.values(IngredientStatus));

function pickOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function pickNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function pickStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function sanitizeRecipe(
  value: unknown,
  type: StudioPlaygroundType,
): StudioPlaygroundRecipe | undefined {
  if (!isRecord(value) || typeof value.text !== 'string') {
    return undefined;
  }

  const recipeType = isStudioPlaygroundType(value.type) ? value.type : type;
  const crunControls = readStudioCrunRecipeControls(
    value.crunControls,
    recipeType,
    value.modelKey,
  );
  if (value.crunControls !== undefined && !crunControls) return undefined;
  if (crunControls && recipeType === 'video') {
    const kling = crunControls.modelKey === 'crun/kling/v2-5-turbo-pro';
    if (
      !Array.isArray(value.references) ||
      value.references.some(
        (id) => !isEntityId(id) || id !== String(id).trim(),
      ) ||
      value.references.length > (kling ? 1 : 0)
    )
      return undefined;
    if (
      value.endFrameId !== undefined &&
      (!kling ||
        !isEntityId(value.endFrameId) ||
        value.endFrameId !== value.endFrameId.trim() ||
        value.references.length !== 1 ||
        value.endFrameId === value.references[0])
    )
      return undefined;
    if (
      value.duration !== undefined &&
      (typeof value.duration !== 'number' ||
        !(kling ? [5, 10] : [4, 6, 8]).includes(value.duration))
    )
      return undefined;
    if (
      value.resolution !== undefined &&
      (kling ||
        typeof value.resolution !== 'string' ||
        !['720p', '1080p', '4k'].includes(value.resolution))
    )
      return undefined;
    if (
      value.aspectRatio !== undefined &&
      (typeof value.aspectRatio !== 'string' ||
        !(kling ? ['1:1', '16:9', '9:16'] : ['16:9', '9:16']).includes(
          value.aspectRatio,
        ) ||
        (kling && value.references.length))
    )
      return undefined;
  }
  return {
    ...(crunControls ? { crunControls } : {}),
    ...(crunControls &&
    recipeType === 'video' &&
    typeof value.endFrameId === 'string'
      ? { endFrameId: value.endFrameId }
      : {}),
    aspectRatio: pickOptionalString(value.aspectRatio),
    blacklist: pickStringList(value.blacklist),
    brandingMode:
      value.brandingMode === 'off' || value.brandingMode === 'brand'
        ? value.brandingMode
        : undefined,
    camera: pickOptionalString(value.camera),
    cameraMovement: pickOptionalString(value.cameraMovement),
    duration: pickNumber(value.duration),
    folder: pickOptionalString(value.folder),
    isAudioEnabled: value.isAudioEnabled === true,
    lens: pickOptionalString(value.lens),
    lighting: pickOptionalString(value.lighting),
    modelKey: pickOptionalString(value.modelKey),
    mood: pickOptionalString(value.mood),
    outputs:
      typeof value.outputs === 'number' &&
      Number.isInteger(value.outputs) &&
      value.outputs >= 1
        ? value.outputs
        : 1,
    originalText:
      typeof value.originalText === 'string' ? value.originalText : undefined,
    promptTemplate: pickOptionalString(value.promptTemplate),
    references: pickStringList(value.references),
    imageEdit: readImageEditingRecipe(value.imageEdit),
    resolution: pickOptionalString(value.resolution),
    scene: pickOptionalString(value.scene),
    speech: pickOptionalString(value.speech),
    style: pickOptionalString(value.style) ?? '',
    tags: pickStringList(value.tags),
    text: value.text,
    type: isStudioPlaygroundType(value.type) ? value.type : type,
  };
}

function sanitizeSessionJob(value: unknown): StudioPlaygroundJob | null {
  if (!isRecord(value)) {
    return null;
  }

  const { createdAt, id, prompt, status, type } = value;

  if (typeof id !== 'string' || !id) {
    return null;
  }
  if (!isStudioPlaygroundType(type)) {
    return null;
  }
  if (typeof status !== 'string' || !SESSION_STATUSES.has(status)) {
    return null;
  }
  if (typeof prompt !== 'string') {
    return null;
  }

  const recipe = sanitizeRecipe(value.recipe, type);

  return {
    createdAt: typeof createdAt === 'number' ? createdAt : 0,
    error: pickOptionalString(value.error),
    phase: value.phase === 'cancelled' ? 'cancelled' : undefined,
    height: pickNumber(value.height),
    id,
    ingredientId: pickOptionalString(value.ingredientId),
    modelKey: pickOptionalString(value.modelKey),
    prompt,
    ...(recipe ? { recipe } : {}),
    runId: pickOptionalString(value.runId),
    status: status as IngredientStatus,
    type,
    url: pickOptionalString(value.url),
    width: pickNumber(value.width),
  };
}

function readSessionStore(): Record<string, unknown> {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.sessionStorage.getItem(STUDIO_PLAYGROUND_SESSION_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeSessionStore(store: Record<string, unknown>): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(
      STUDIO_PLAYGROUND_SESSION_KEY,
      JSON.stringify(store),
    );
  } catch {
    // Session persistence is a convenience for in-flight resubscribe.
  }
}

export function serializeStudioPlaygroundSessionJob(
  job: StudioPlaygroundJob,
): StudioPlaygroundJob {
  return {
    createdAt: job.createdAt,
    error: job.error,
    phase: job.phase === 'cancelled' ? 'cancelled' : undefined,
    height: job.height,
    id: job.id,
    ingredientId: job.ingredientId,
    modelKey: job.modelKey,
    prompt: job.prompt,
    recipe: sanitizeRecipe(job.recipe, job.type),
    runId: job.runId,
    status: job.status,
    type: job.type,
    url: job.url,
    width: job.width,
  };
}

export function readStudioPlaygroundSessionJobs(
  brandId: string,
): StudioPlaygroundJob[] {
  if (!brandId) {
    return [];
  }

  const stored = readSessionStore()[brandId];
  if (!Array.isArray(stored)) {
    return [];
  }

  return stored
    .map((entry) => sanitizeSessionJob(entry))
    .filter((job): job is StudioPlaygroundJob => job !== null)
    .slice(0, STUDIO_PLAYGROUND_SESSION_LIMIT);
}

export function writeStudioPlaygroundSessionJobs(
  brandId: string,
  jobs: readonly StudioPlaygroundJob[],
): void {
  if (!brandId) {
    return;
  }

  const store = readSessionStore();
  store[brandId] = jobs
    .filter((job) => job.phase !== 'submitting')
    .slice(0, STUDIO_PLAYGROUND_SESSION_LIMIT)
    .map(serializeStudioPlaygroundSessionJob);
  writeSessionStore(store);
}
