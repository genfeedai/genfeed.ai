import {
  MODEL_OUTPUT_CAPABILITIES,
  type ModelOutputCapability,
} from '@genfeedai/constants';
import { ModelCategory } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import { getModelCapability } from './model-capability.helper';

const CATEGORIES_WITHOUT_ASPECT_RATIO = new Set([
  ModelCategory.TEXT,
  ModelCategory.EMBEDDING,
  ModelCategory.MUSIC,
  ModelCategory.IMAGE_UPSCALE,
  ModelCategory.VIDEO_UPSCALE,
]);

const DEFAULT_ASPECT_RATIO_BY_CATEGORY: Record<string, string> = {
  [ModelCategory.VIDEO]: '16:9',
  [ModelCategory.VIDEO_EDIT]: '16:9',
  [ModelCategory.VOICE]: '16:9',
  [ModelCategory.IMAGE]: '1:1',
  [ModelCategory.IMAGE_EDIT]: '1:1',
};

function getModelAspectRatioConfig(
  modelKey: string | string,
  capability?: ModelOutputCapability | null,
): {
  available: readonly string[];
  default: string;
  usesOrientation?: boolean;
} {
  const cap = capability ?? MODEL_OUTPUT_CAPABILITIES[modelKey as string];
  if (!cap) {
    return { available: ['1:1', '9:16', '16:9'], default: '16:9' };
  }

  if (CATEGORIES_WITHOUT_ASPECT_RATIO.has(cap.category)) {
    return { available: [], default: '16:9' };
  }

  const defaultRatio = DEFAULT_ASPECT_RATIO_BY_CATEGORY[cap.category] ?? '16:9';

  if (cap.category === ModelCategory.VIDEO) {
    return {
      available: cap.aspectRatios ?? [],
      default: cap.defaultAspectRatio ?? defaultRatio,
      usesOrientation: cap.usesOrientation,
    };
  }

  return {
    available: (cap as { aspectRatios?: readonly string[] }).aspectRatios ?? [],
    default:
      (cap as { defaultAspectRatio?: string }).defaultAspectRatio ??
      defaultRatio,
  };
}

export function getDefaultAspectRatio(
  modelKey: string | string,
  capability?: ModelOutputCapability | null,
): string {
  return getModelAspectRatioConfig(modelKey, capability).default;
}

export function getAspectRatiosForModel(
  modelKey: string | string,
  capability?: ModelOutputCapability | null,
): readonly string[] {
  return getModelAspectRatioConfig(modelKey, capability).available;
}

export function normalizeAspectRatioForModel(
  modelKey: string | string,
  aspectRatio: string,
  capability?: ModelOutputCapability | null,
): string {
  const config = getModelAspectRatioConfig(modelKey, capability);

  if (config.available.includes(aspectRatio)) {
    return aspectRatio;
  }

  if (config.usesOrientation) {
    return convertRatioToOrientation(aspectRatio);
  }

  return config.default;
}

const ASPECT_RATIO_MAP: Array<{ ratio: number; label: string }> = [
  { label: '16:9', ratio: 16 / 9 },
  { label: '21:9', ratio: 21 / 9 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '3:2', ratio: 3 / 2 },
  { label: '5:4', ratio: 5 / 4 },
  { label: '2:1', ratio: 2 / 1 },
  { label: '9:16', ratio: 9 / 16 },
  { label: '3:4', ratio: 3 / 4 },
  { label: '2:3', ratio: 2 / 3 },
  { label: '4:5', ratio: 4 / 5 },
  { label: '1:2', ratio: 1 / 2 },
  { label: '1:1', ratio: 1 },
];

const TOLERANCE = 0.1;

export function calculateAspectRatio(width?: number, height?: number): string {
  if (!width || !height) {
    return '16:9';
  }

  const gcd = calculateGCD(width, height);
  const ratio = width / gcd / (height / gcd);

  for (const { ratio: targetRatio, label } of ASPECT_RATIO_MAP) {
    if (Math.abs(ratio - targetRatio) < TOLERANCE) {
      return label;
    }
  }

  return width > height ? '16:9' : '9:16';
}

function calculateGCD(a: number, b: number): number {
  return b === 0 ? a : calculateGCD(b, a % b);
}

export function isAspectRatioSupported(
  modelKey: string | string,
  aspectRatio: string,
  capability?: ModelOutputCapability | null,
): boolean {
  return getModelAspectRatioConfig(modelKey, capability).available.includes(
    aspectRatio,
  );
}

const PORTRAIT_RATIOS = new Set(['9:16', '3:4', '2:3', '1:2']);

export function convertRatioToOrientation(
  ratio: string,
): 'portrait' | 'landscape' {
  if (PORTRAIT_RATIOS.has(ratio)) {
    return 'portrait';
  }
  return 'landscape';
}

// ============================================================================
// IModel-based overloads
// ============================================================================

/** Get default aspect ratio from an IModel document (DB-backed with constant fallback). */
export function getDefaultAspectRatioFromModel(model: IModel): string {
  return getDefaultAspectRatio(model.key, getModelCapability(model));
}

/** Get available aspect ratios from an IModel document. */
export function getAspectRatiosFromModel(model: IModel): readonly string[] {
  return getAspectRatiosForModel(model.key, getModelCapability(model));
}

/** Normalize an aspect ratio for an IModel document. */
export function normalizeAspectRatioFromModel(
  model: IModel,
  aspectRatio: string,
): string {
  return normalizeAspectRatioForModel(
    model.key,
    aspectRatio,
    getModelCapability(model),
  );
}

/** Check if an aspect ratio is supported by an IModel document. */
export function isAspectRatioSupportedFromModel(
  model: IModel,
  aspectRatio: string,
): boolean {
  return isAspectRatioSupported(
    model.key,
    aspectRatio,
    getModelCapability(model),
  );
}
