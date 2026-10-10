import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import { IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { StudioCrunControls } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import type {
  StudioPlaygroundJob,
  StudioPlaygroundRecipe,
  StudioPlaygroundRun,
  StudioPlaygroundSettings,
  StudioPlaygroundType,
} from '@pages/studio/playground/types';
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import { STUDIO_ASPECT_RATIOS } from './studio-playground-settings';
import { getStudioPlaygroundTypeConfig } from './studio-playground-types';

/** Stored-shape validation only; live model/version validation belongs to restore and quote. */
export function readStudioCrunRecipeControls(
  value: unknown,
  type: StudioPlaygroundType,
  modelKey: unknown,
): StudioCrunControls | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const input = value as Record<string, unknown>;
  if (
    input.modelKey !== modelKey ||
    typeof modelKey !== 'string' ||
    typeof input.contractVersion !== 'string' ||
    !input.contractVersion.trim() ||
    input.contractVersion.length > 128
  )
    return undefined;
  const nano = modelKey === 'crun/google/nano-banana-pro';
  const seedream = modelKey === 'crun/bytedance/seedream-4-5';
  const kling = modelKey === 'crun/kling/v2-5-turbo-pro';
  const veo = modelKey === 'crun/google/veo3-1-fast-t2v';
  if (
    !(
      (type === 'image' && (nano || seedream)) ||
      (type === 'video' && (kling || veo))
    )
  )
    return undefined;
  const allowed = [
    'modelKey',
    'contractVersion',
    'aspectRatio',
    ...(nano ? ['outputFormat'] : []),
    ...(kling ? ['negativePrompt', 'guidanceScale'] : []),
    ...(veo ? ['translatePrompt'] : []),
  ];
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    return undefined;
  const ratios = kling
    ? ['1:1', '16:9', '9:16']
    : veo
      ? ['16:9', '9:16']
      : nano
        ? [
            'auto',
            '1:1',
            '2:3',
            '3:2',
            '3:4',
            '4:3',
            '4:5',
            '5:4',
            '9:16',
            '16:9',
            '21:9',
          ]
        : ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9'];
  if (
    input.aspectRatio !== undefined &&
    (typeof input.aspectRatio !== 'string' ||
      !ratios.includes(input.aspectRatio))
  )
    return undefined;
  if (
    input.outputFormat !== undefined &&
    input.outputFormat !== 'png' &&
    input.outputFormat !== 'jpg'
  )
    return undefined;
  if (
    input.negativePrompt !== undefined &&
    (typeof input.negativePrompt !== 'string' ||
      input.negativePrompt.length > 2000)
  )
    return undefined;
  if (
    input.guidanceScale !== undefined &&
    (typeof input.guidanceScale !== 'number' ||
      !Number.isFinite(input.guidanceScale) ||
      input.guidanceScale < 0 ||
      input.guidanceScale > 1)
  )
    return undefined;
  if (
    input.translatePrompt !== undefined &&
    typeof input.translatePrompt !== 'boolean'
  )
    return undefined;
  return {
    modelKey,
    contractVersion: input.contractVersion,
    ...(typeof input.aspectRatio === 'string'
      ? { aspectRatio: input.aspectRatio }
      : {}),
    ...(typeof input.outputFormat === 'string'
      ? { outputFormat: input.outputFormat }
      : {}),
    ...(typeof input.negativePrompt === 'string'
      ? { negativePrompt: input.negativePrompt }
      : {}),
    ...(typeof input.guidanceScale === 'number'
      ? { guidanceScale: input.guidanceScale }
      : {}),
    ...(typeof input.translatePrompt === 'boolean'
      ? { translatePrompt: input.translatePrompt }
      : {}),
  };
}

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
  readonly [keyof StudioPlaygroundRecipe, string]
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

export function isStudioPlaygroundJobPending(
  status: IngredientStatus,
): boolean {
  return (
    status === IngredientStatus.PROCESSING || status === IngredientStatus.DRAFT
  );
}

/**
 * Brand voice cannot apply to music, avatar, or voice — record `'off'`
 * regardless of what the source data says, so a recipe never claims brand
 * enrichment for an output type it can't reach (#4676 FR8).
 *
 * For types that do support it, `isBrandingApplied` must be the real,
 * capability-gated flag the payload actually carried — `undefined` means the
 * source genuinely does not know (a reprompt built from `buildRepromptData`,
 * or ingredient metadata with no stored brand state), not "off". Guessing
 * `'off'` here silently disables brand voice on the next Vary/reprompt and
 * misreports it in the inspector — the caller must record "unknown" and
 * leave any existing setting alone instead.
 */
function resolveRecipeBrandingMode(
  type: StudioPlaygroundType,
  isBrandingApplied: boolean | undefined,
): 'brand' | 'off' | undefined {
  if (!getStudioPlaygroundTypeConfig(type).capabilities.hasBrandEnrichment) {
    return 'off';
  }
  if (isBrandingApplied === undefined) {
    return undefined;
  }
  return isBrandingApplied ? 'brand' : 'off';
}

/** Tri-state read of a persisted `metadata.brandingMode` — absent/unrecognized is unknown, not "off". */
function metadataIsBrandingApplied(value: unknown): boolean | undefined {
  if (value === 'brand') {
    return true;
  }
  if (value === 'off') {
    return false;
  }
  return undefined;
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
  type: StudioPlaygroundType,
  settings: StudioPlaygroundSettings,
  originalText?: string,
): StudioPlaygroundRecipe {
  return {
    ...(originalText !== undefined ? { originalText } : {}),
    ...(settings.crunControls &&
    settings.crunControls.modelKey === settings.modelKey &&
    (type === 'image' || type === 'video')
      ? { crunControls: { ...settings.crunControls } }
      : {}),
    aspectRatio: settings.aspectRatio,
    blacklist: promptData.blacklist ?? [],
    brandingMode: resolveRecipeBrandingMode(type, promptData.isBrandingEnabled),
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
  type: StudioPlaygroundType,
): StudioPlaygroundRecipe {
  const modelKey = optionalText(promptData.models?.[0]);

  return {
    aspectRatio: resolveAspectRatioFromDimensions(
      promptData.width,
      promptData.height,
    ),
    blacklist: promptData.blacklist ?? [],
    brandingMode: resolveRecipeBrandingMode(type, promptData.isBrandingEnabled),
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
  type: StudioPlaygroundType,
): StudioPlaygroundRecipe {
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
    originalText: readStudioOriginalPrompt(ingredient),
    imageEdit: ingredient.imageEdit,
    aspectRatio:
      ingredient.imageEdit?.aspectRatio ??
      resolveAspectRatioFromDimensions(width, height),
    blacklist: stringList(metadata.blacklist),
    brandingMode: resolveRecipeBrandingMode(
      type,
      metadataIsBrandingApplied(metadata.brandingMode),
    ),
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
    outputs: ingredient.imageEdit?.outputs ?? 1,
    promptTemplate: optional('promptTemplate') || optional('prompt_template'),
    references:
      ingredient.imageEdit?.sourceIds ??
      (Array.isArray(ingredient.references)
        ? ingredient.references.filter(
            (reference): reference is string => typeof reference === 'string',
          )
        : []),
    resolution: ingredient.imageEdit?.resolution ?? optional('resolution'),
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
  job: StudioPlaygroundJob,
): StudioPlaygroundRecipe | null {
  if (job.recipe) {
    return {
      ...job.recipe,
      originalText:
        job.recipe.originalText ??
        (job.ingredient ? readStudioOriginalPrompt(job.ingredient) : undefined),
    };
  }

  if (job.ingredient) {
    return recipeFromIngredient(job.ingredient, job.type);
  }

  if (!job.prompt.trim()) {
    return null;
  }

  return {
    blacklist: [],
    brandingMode: resolveRecipeBrandingMode(job.type, undefined),
    isAudioEnabled: false,
    outputs: 1,
    references: [],
    style: '',
    tags: [],
    text: job.prompt.trim(),
    type: job.type,
  };
}

/** Legacy promptText is effective text, never evidence of original intent. */
export function readStudioOriginalPrompt(
  ingredient: IIngredient,
): string | undefined {
  const receipt = ingredient.generationHarness;
  if (
    ingredient.isDeleted ||
    !ingredient.brandId ||
    !receipt ||
    receipt.brandId !== ingredient.brandId ||
    typeof receipt.originalPrompt !== 'string' ||
    typeof receipt.enhancedPrompt !== 'string' ||
    !['applied', 'skipped', 'failed'].includes(receipt.status) ||
    !['default', 'organization', 'brand', 'request'].includes(receipt.source) ||
    !Array.isArray(receipt.appliedPacks)
  )
    return undefined;
  return receipt.originalPrompt;
}

function boundedAssetLabel(name: string): string {
  return name.length > 100 ? `${name.slice(0, 99)}…` : name;
}

/** Reference names preserve recorded labels, never a provider-prompt fallback. */
export function studioIngredientAccessibleLabel(
  ingredient: IIngredient,
): string {
  const original = readStudioOriginalPrompt(ingredient);
  return boundedAssetLabel(
    original?.trim() ||
      ingredient.metadataLabel?.trim() ||
      `Asset ${ingredient.id}`,
  );
}

/** A control name is recorded intent or asset identity; the full recipe stays in its rail. */
export function studioAssetAccessibleLabel(job: StudioPlaygroundJob): string {
  const original =
    job.recipe?.originalText ??
    (job.ingredient ? readStudioOriginalPrompt(job.ingredient) : undefined);
  const name =
    original?.trim() ||
    `${getStudioPlaygroundTypeConfig(job.type).label} ${job.id}`;
  return boundedAssetLabel(name);
}

/**
 * The Recipe rail shows this string — the enriched request, not the raw box.
 * Look / brand / template fields that actually rode on `buildStudioPromptData`
 * are appended so the operator can see what reached the provider.
 */
export function formatStudioRecipePrompt(
  recipe: StudioPlaygroundRecipe,
): string {
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
      // Unknown brand state (no source recorded what was actually applied)
      // is left off the inspector entirely rather than guessed (#4676).
      if (recipe.brandingMode !== undefined) {
        details.push(
          `${label}: ${recipe.brandingMode === 'brand' ? 'on' : 'off'}`,
        );
      }
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

  if (recipe.imageEdit) {
    if (recipe.imageEdit.resolution)
      details.push(
        `Resolution: ${recipe.imageEdit.resolution}`,
        `Aspect ratio: ${recipe.imageEdit.aspectRatio}`,
      );
    else details.push(`Edit size: ${recipe.imageEdit.size}`, `Quality: Medium`);
    if (recipe.imageEdit.maskId)
      details.push('Mask: black changes, white stays');
    if (recipe.imageEdit.seed !== undefined)
      details.push(`Seed: ${recipe.imageEdit.seed}`);
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
  recipe: StudioPlaygroundRecipe,
): Partial<StudioPlaygroundSettings> {
  const modelKey = optionalText(recipe.modelKey);

  return {
    ...(modelKey?.startsWith('crun/') &&
    (recipe.type === 'image' || recipe.type === 'video')
      ? {
          crunControls: readStudioCrunRecipeControls(
            recipe.crunControls,
            recipe.type,
            modelKey,
          ),
        }
      : {}),
    ...(recipe.imageEdit
      ? {
          editSize: recipe.imageEdit.size,
          editPrimaryId: recipe.imageEdit.sourceIds[0],
          editSeed: recipe.imageEdit.seed,
        }
      : {}),
    ...(recipe.aspectRatio ? { aspectRatio: recipe.aspectRatio } : {}),
    blacklist: recipe.blacklist,
    // Unknown (undefined) means the source never recorded the applied brand
    // state — leave the composer's current Brand voice setting alone rather
    // than silently forcing it off (#4676).
    ...(recipe.brandingMode !== undefined
      ? { brandingMode: recipe.brandingMode }
      : {}),
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
export function groupStudioPlaygroundJobsByRun(
  jobs: readonly StudioPlaygroundJob[],
): StudioPlaygroundRun[] {
  const order: string[] = [];
  const grouped = new Map<string, StudioPlaygroundJob[]>();

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
