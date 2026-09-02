import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import { IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type {
  StudioGenerateJob,
  StudioGenerateRecipe,
  StudioGenerateRun,
  StudioGenerateSettings,
  StudioGenerateType,
} from '@pages/studio/generate/types';
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import { STUDIO_ASPECT_RATIOS } from './studio-generate-settings';

const RECIPE_FIELD_LABELS = [
  ['brandingMode', 'Brand enrichment'],
  ['promptTemplate', 'Template'],
  ['style', 'Style'],
  ['mood', 'Mood'],
  ['scene', 'Scene'],
  ['camera', 'Camera'],
  ['cameraMovement', 'Camera movement'],
  ['lighting', 'Lighting'],
  ['lens', 'Lens'],
  ['aspectRatio', 'Aspect'],
  ['resolution', 'Resolution'],
  ['duration', 'Duration'],
  ['outputs', 'Outputs'],
  ['modelKey', 'Model'],
  ['folder', 'Folder'],
] as const satisfies ReadonlyArray<
  readonly [keyof StudioGenerateRecipe, string]
>;

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function ratioValue(aspectRatio: string): number | null {
  const [rawHorizontal, rawVertical] = aspectRatio.split(':');
  const horizontal = Number(rawHorizontal);
  const vertical = Number(rawVertical);

  if (
    !Number.isFinite(horizontal) ||
    !Number.isFinite(vertical) ||
    horizontal <= 0 ||
    vertical <= 0
  ) {
    return null;
  }

  return horizontal / vertical;
}

/**
 * Picks the closest aspect ladder entry for a stored width/height pair so
 * Vary can restore the compositor instead of a raw pixel size.
 */
export function resolveAspectRatioFromDimensions(
  width: number,
  height: number,
): string | undefined {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }

  const target = width / height;
  let bestRatio: (typeof STUDIO_ASPECT_RATIOS)[number] =
    STUDIO_ASPECT_RATIOS[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const aspectRatio of STUDIO_ASPECT_RATIOS) {
    const value = ratioValue(aspectRatio);
    if (value === null) {
      continue;
    }

    const distance = Math.abs(value - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestRatio = aspectRatio;
    }
  }

  return bestRatio;
}

export function isStudioGenerateJobPending(status: IngredientStatus): boolean {
  return (
    status === IngredientStatus.PROCESSING || status === IngredientStatus.DRAFT
  );
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
}

/**
 * Snapshot of the payload `useStudioGeneration` posted after
 * `buildStudioPromptData`. Settings contribute the human ladder values
 * (aspect, resolution, model) that the schema only stores as pixels/keys.
 */
export function recipeFromPromptData(
  promptData: PromptTextareaSchema & { isValid: boolean },
  type: StudioGenerateType,
  settings: StudioGenerateSettings,
): StudioGenerateRecipe {
  return {
    aspectRatio: settings.aspectRatio,
    blacklist: promptData.blacklist ?? [],
    brandingMode: promptData.brandingMode === 'off' ? 'off' : 'brand',
    camera: optionalText(promptData.camera),
    cameraMovement: optionalText(promptData.cameraMovement),
    duration: promptData.duration,
    folder: optionalText(promptData.folder),
    isAudioEnabled: promptData.isAudioEnabled === true,
    lens: optionalText(promptData.lens),
    lighting: optionalText(promptData.lighting),
    modelKey: optionalText(settings.modelKey),
    mood: optionalText(promptData.mood),
    outputs: promptData.outputs || 1,
    promptTemplate: optionalText(promptData.prompt_template),
    references: promptData.references ?? [],
    resolution: optionalText(settings.resolution),
    scene: optionalText(promptData.scene),
    speech: optionalText(promptData.speech),
    style: optionalText(promptData.style) ?? '',
    tags: promptData.tags ?? [],
    text: promptData.text?.trim() || '',
    type,
  };
}

export function recipeFromRepromptData(
  promptData: PromptTextareaSchema & { isValid: boolean },
  type: StudioGenerateType,
): StudioGenerateRecipe {
  const modelKey = optionalText(promptData.models?.[0]);

  return {
    aspectRatio: resolveAspectRatioFromDimensions(
      promptData.width,
      promptData.height,
    ),
    blacklist: promptData.blacklist ?? [],
    brandingMode: promptData.brandingMode === 'off' ? 'off' : 'brand',
    camera: optionalText(promptData.camera),
    cameraMovement: optionalText(promptData.cameraMovement),
    duration: promptData.duration,
    folder: optionalText(promptData.folder),
    isAudioEnabled: promptData.isAudioEnabled === true,
    lens: optionalText(promptData.lens),
    lighting: optionalText(promptData.lighting),
    modelKey,
    mood: optionalText(promptData.mood),
    outputs: 1,
    promptTemplate: optionalText(promptData.prompt_template),
    references: promptData.references ?? [],
    resolution: optionalText(promptData.resolution),
    scene: optionalText(promptData.scene),
    speech: optionalText(promptData.speech),
    style: optionalText(promptData.style) ?? '',
    tags: promptData.tags ?? [],
    text: promptData.text?.trim() || '',
    type,
  };
}

export function recipeFromIngredient(
  ingredient: IIngredient,
  type: StudioGenerateType,
): StudioGenerateRecipe {
  const metadata: Record<string, unknown> =
    typeof ingredient.metadata === 'object' && ingredient.metadata !== null
      ? (ingredient.metadata as unknown as Record<string, unknown>)
      : {};
  const optional = (key: string): string | undefined => {
    const value = metadata[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  };
  const width = ingredient.metadataWidth || ingredient.width || 0;
  const height = ingredient.metadataHeight || ingredient.height || 0;

  return {
    aspectRatio: resolveAspectRatioFromDimensions(width, height),
    blacklist: stringList(metadata.blacklist),
    brandingMode: metadata.brandingMode === 'off' ? 'off' : 'brand',
    camera: optional('camera'),
    cameraMovement: optional('cameraMovement'),
    duration:
      typeof metadata.duration === 'number' ? metadata.duration : undefined,
    folder: optional('folder'),
    isAudioEnabled: metadata.isAudioEnabled === true,
    lens: optional('lens'),
    lighting: optional('lighting'),
    modelKey:
      optionalText(ingredient.metadataModel) ||
      optional('model') ||
      optionalText(ingredient.model),
    mood: optional('mood'),
    outputs: 1,
    promptTemplate: optional('promptTemplate') || optional('prompt_template'),
    references: Array.isArray(ingredient.references)
      ? ingredient.references.filter(
          (reference): reference is string => typeof reference === 'string',
        )
      : [],
    resolution: optional('resolution'),
    scene: optional('scene'),
    speech: optional('speech'),
    style: optional('style') ?? '',
    tags: Array.isArray(ingredient.tags)
      ? ingredient.tags
          .map((tag) => tag.key || tag.label || tag.id)
          .filter((key): key is string => typeof key === 'string')
      : [],
    text: ingredient.promptText?.trim() || '',
    type,
  };
}

export function resolveRecipeForJob(
  job: StudioGenerateJob,
): StudioGenerateRecipe | null {
  if (job.recipe) {
    return job.recipe;
  }

  if (job.ingredient) {
    return recipeFromIngredient(job.ingredient, job.type);
  }

  if (!job.prompt.trim()) {
    return null;
  }

  return {
    blacklist: [],
    brandingMode: 'off',
    isAudioEnabled: false,
    outputs: 1,
    references: [],
    style: '',
    tags: [],
    text: job.prompt.trim(),
    type: job.type,
  };
}

/**
 * The Recipe rail shows this string — the enriched request, not the raw box.
 * Look / brand / template fields that actually rode on `buildStudioPromptData`
 * are appended so the operator can see what reached the provider.
 */
export function formatStudioRecipePrompt(recipe: StudioGenerateRecipe): string {
  const lines: string[] = [];

  if (recipe.text) {
    lines.push(recipe.text);
  }

  if (recipe.speech && recipe.speech !== recipe.text) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(`Speech: ${recipe.speech}`);
  }

  const details: string[] = [];

  for (const [key, label] of RECIPE_FIELD_LABELS) {
    const value = recipe[key];

    if (key === 'brandingMode') {
      details.push(
        `${label}: ${recipe.brandingMode === 'brand' ? 'on' : 'off'}`,
      );
      continue;
    }

    if (key === 'outputs') {
      if (recipe.outputs > 1) {
        details.push(`${label}: ${recipe.outputs}`);
      }
      continue;
    }

    if (key === 'duration') {
      if (typeof recipe.duration === 'number') {
        details.push(`${label}: ${recipe.duration}s`);
      }
      continue;
    }

    if (key === 'modelKey') {
      const modelKey = optionalText(recipe.modelKey);
      if (modelKey && modelKey !== AUTO_MODEL_OPTION_VALUE) {
        details.push(`${label}: ${modelKey}`);
      }
      continue;
    }

    if (typeof value === 'string' && value.trim()) {
      details.push(`${label}: ${value.trim()}`);
    }
  }

  if (recipe.references.length > 0) {
    details.push(`References: ${recipe.references.length}`);
  }

  if (details.length > 0) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(...details);
  }

  return lines.join('\n');
}

export function settingsPatchFromRecipe(
  recipe: StudioGenerateRecipe,
): Partial<StudioGenerateSettings> {
  const modelKey = optionalText(recipe.modelKey);

  return {
    ...(recipe.aspectRatio ? { aspectRatio: recipe.aspectRatio } : {}),
    blacklist: recipe.blacklist,
    brandingMode: recipe.brandingMode,
    camera: recipe.camera,
    cameraMovement: recipe.cameraMovement,
    duration: recipe.duration,
    folder: recipe.folder,
    isAudioEnabled: recipe.isAudioEnabled,
    lens: recipe.lens,
    lighting: recipe.lighting,
    modelKey: modelKey || AUTO_MODEL_OPTION_VALUE,
    mood: recipe.mood,
    outputs: recipe.outputs,
    promptTemplate: recipe.promptTemplate,
    ...(recipe.resolution ? { resolution: recipe.resolution } : {}),
    scene: recipe.scene,
    speech: recipe.speech,
    style: recipe.style,
    tags: recipe.tags,
  };
}

/**
 * Groups N outputs from one submit under the run id stamped at submit time.
 * Gallery rows without a run id each stay their own singleton run.
 */
export function groupStudioGenerateJobsByRun(
  jobs: readonly StudioGenerateJob[],
): StudioGenerateRun[] {
  const order: string[] = [];
  const grouped = new Map<string, StudioGenerateJob[]>();

  for (const job of jobs) {
    const runId = job.runId || job.id;
    const existing = grouped.get(runId);

    if (existing) {
      existing.push(job);
      continue;
    }

    grouped.set(runId, [job]);
    order.push(runId);
  }

  return order.map((id) => {
    const runJobs = grouped.get(id) ?? [];

    return {
      createdAt: runJobs[0]?.createdAt ?? 0,
      id,
      jobs: runJobs,
    };
  });
}
