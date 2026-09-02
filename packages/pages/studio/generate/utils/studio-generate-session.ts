import { IngredientStatus } from '@genfeedai/contracts';
import type {
  StudioGenerateJob,
  StudioGenerateRecipe,
  StudioGenerateType,
} from '@pages/studio/generate/types';
import { isStudioGenerateType } from './studio-generate-types';

export const STUDIO_GENERATE_SESSION_KEY = 'genfeed.studio.generate.session.v1';
export const STUDIO_GENERATE_SESSION_LIMIT = 48;

const SESSION_STATUSES = new Set<string>(Object.values(IngredientStatus));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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
  type: StudioGenerateType,
): StudioGenerateRecipe | undefined {
  if (!isRecord(value) || typeof value.text !== 'string') {
    return undefined;
  }

  return {
    aspectRatio: pickOptionalString(value.aspectRatio),
    blacklist: pickStringList(value.blacklist),
    brandingMode: value.brandingMode === 'off' ? 'off' : 'brand',
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
    promptTemplate: pickOptionalString(value.promptTemplate),
    references: pickStringList(value.references),
    resolution: pickOptionalString(value.resolution),
    scene: pickOptionalString(value.scene),
    speech: pickOptionalString(value.speech),
    style: pickOptionalString(value.style) ?? '',
    tags: pickStringList(value.tags),
    text: value.text,
    type: isStudioGenerateType(value.type) ? value.type : type,
  };
}

function sanitizeSessionJob(value: unknown): StudioGenerateJob | null {
  if (!isRecord(value)) {
    return null;
  }

  const { createdAt, id, prompt, status, type } = value;

  if (typeof id !== 'string' || !id) {
    return null;
  }
  if (!isStudioGenerateType(type)) {
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
    const raw = window.sessionStorage.getItem(STUDIO_GENERATE_SESSION_KEY);
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
      STUDIO_GENERATE_SESSION_KEY,
      JSON.stringify(store),
    );
  } catch {
    // Session persistence is a convenience for in-flight resubscribe.
  }
}

export function serializeStudioGenerateSessionJob(
  job: StudioGenerateJob,
): StudioGenerateJob {
  return {
    createdAt: job.createdAt,
    error: job.error,
    height: job.height,
    id: job.id,
    ingredientId: job.ingredientId,
    modelKey: job.modelKey,
    prompt: job.prompt,
    recipe: job.recipe,
    runId: job.runId,
    status: job.status,
    type: job.type,
    url: job.url,
    width: job.width,
  };
}

export function readStudioGenerateSessionJobs(
  brandId: string,
): StudioGenerateJob[] {
  if (!brandId) {
    return [];
  }

  const stored = readSessionStore()[brandId];
  if (!Array.isArray(stored)) {
    return [];
  }

  return stored
    .map((entry) => sanitizeSessionJob(entry))
    .filter((job): job is StudioGenerateJob => job !== null)
    .slice(0, STUDIO_GENERATE_SESSION_LIMIT);
}

export function writeStudioGenerateSessionJobs(
  brandId: string,
  jobs: readonly StudioGenerateJob[],
): void {
  if (!brandId) {
    return;
  }

  const store = readSessionStore();
  store[brandId] = jobs
    .slice(0, STUDIO_GENERATE_SESSION_LIMIT)
    .map(serializeStudioGenerateSessionJob);
  writeSessionStore(store);
}
