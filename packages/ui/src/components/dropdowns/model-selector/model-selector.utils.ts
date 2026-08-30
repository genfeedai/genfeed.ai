import {
  COST_TIER_DISPLAY,
  extractBrandFromKey,
  getBrandConfig,
} from '@genfeedai/constants';
import { CostTier, QualityTier, SpeedTier } from '@genfeedai/enums';
import { getModelBrandIcon } from '@genfeedai/helpers/ui/icons/model-brand-icon';
import type { IModel } from '@genfeedai/interfaces';
import type {
  ModelSelectorCapability,
  ModelSelectorOption,
} from '@genfeedai/props/ui/model-selector/model-selector.props';
import { Film, Images, Layers, Volume2, Wand2, Zap } from 'lucide-react';

type ModelWithLifecycle = IModel & {
  deprecatedAt?: string | Date;
  isDeprecated?: boolean;
};

const KNOWN_VARIANT_SUFFIXES = new Set([
  'avatar',
  'base',
  'dev',
  'edit',
  'fast',
  'flash',
  'high',
  'i2v',
  'klein',
  'lite',
  'lora',
  'max',
  'mini',
  'preview',
  'pro',
  'pulid',
  'refiner',
  'slow',
  'standard',
  't2v',
  'turbo',
  'ultra',
  'upscale',
]);

function titleCaseToken(value: string): string {
  return value
    .split(/[-_\s]+/)
    .reduce<string[]>((acc, token) => {
      if (token) {
        acc.push(
          token.length <= 3 && token === token.toUpperCase()
            ? token
            : token.charAt(0).toUpperCase() + token.slice(1).toLowerCase(),
        );
      }
      return acc;
    }, [])
    .join(' ');
}

function formatVersion(version: string): string {
  return version.includes('.') ? version : `${version}.0`;
}

function humanizeSlug(slug: string): string {
  return slug
    .split('-')
    .reduce<string[]>((acc, token) => {
      if (token) {
        acc.push(
          /^\d+(?:\.\d+)?$/.test(token)
            ? formatVersion(token)
            : titleCaseToken(token),
        );
      }
      return acc;
    }, [])
    .join(' ');
}

function getModelSlug(modelKey: string): string {
  const slashIndex = modelKey.indexOf('/');
  return slashIndex >= 0 ? modelKey.slice(slashIndex + 1) : modelKey;
}

function getFallbackFamilyLabel(label: string): string {
  return label.replace(/\s*\(([^)]+)\)\s*$/, '').trim() || label;
}

/**
 * Family and variant no longer draw an accordion — the list is flat. They are
 * still parsed so siblings sort next to each other and so a search for the
 * family name ("veo") surfaces every variant.
 */
export function parseModelFamilyAndVariant(
  model: Pick<IModel, 'key' | 'label'>,
): {
  familyKey: string;
  familyLabel: string;
  variantLabel: string;
} {
  const brandSlug = extractBrandFromKey(model.key);
  const modelSlug = getModelSlug(model.key);

  const versionMatch = modelSlug.match(/^(.+?)-(\d+(?:\.\d+)?)(?:-(.+))?$/i);
  if (versionMatch) {
    const [, baseSlug, version, suffix] = versionMatch;
    return {
      familyKey: `${brandSlug}:${baseSlug}`,
      familyLabel: humanizeSlug(baseSlug),
      variantLabel: suffix
        ? `${formatVersion(version)} ${titleCaseToken(suffix)}`
        : formatVersion(version),
    };
  }

  const stripped = stripKnownVariantSuffixes(modelSlug);
  if (stripped) {
    return {
      familyKey: `${brandSlug}:${stripped.familySlug}`,
      familyLabel: humanizeSlug(stripped.familySlug),
      variantLabel: stripped.variantLabel,
    };
  }

  return {
    familyKey: `${brandSlug}:${modelSlug}`,
    familyLabel: getFallbackFamilyLabel(model.label),
    variantLabel: 'Base',
  };
}

function stripKnownVariantSuffixes(modelSlug: string): {
  familySlug: string;
  variantLabel: string;
} | null {
  const tokens = modelSlug.split('-').filter(Boolean);
  const variantTokens: string[] = [];

  while (
    tokens.length > 1 &&
    KNOWN_VARIANT_SUFFIXES.has(tokens[tokens.length - 1]?.toLowerCase() ?? '')
  ) {
    const token = tokens.pop();
    if (token) {
      variantTokens.unshift(token);
    }
  }

  if (variantTokens.length === 0) {
    return null;
  }

  return {
    familySlug: tokens.join('-'),
    variantLabel: variantTokens.map((token) => titleCaseToken(token)).join(' '),
  };
}

export function transformModelsToOptions(
  models: readonly IModel[],
  favoriteModelKeys: string[],
  sourceGroupResolver?: (model: IModel) => string | undefined,
): ModelSelectorOption[] {
  const favoritesSet = new Set(favoriteModelKeys);

  return models.map((model) => {
    const brandSlug = extractBrandFromKey(model.key);
    const brandConfig = getBrandConfig(brandSlug);
    const family = parseModelFamilyAndVariant(model);

    return {
      brandColor: brandConfig.color,
      brandIcon: getModelBrandIcon(brandConfig.iconKey),
      brandLabel: brandConfig.label,
      brandSlug,
      costTier: model.costTier as CostTier | undefined,
      familyKey: family.familyKey,
      familyLabel: family.familyLabel,
      isDeprecated:
        model.isLegacy === true ||
        (model as ModelWithLifecycle).isDeprecated === true,
      isFavorite: favoritesSet.has(model.key),
      model,
      sourceGroup: sourceGroupResolver?.(model),
      variantLabel: family.variantLabel,
    };
  });
}

export function buildPricingLabel(model: IModel): string {
  switch (model.pricingType) {
    case 'per-megapixel':
      return `${model.costPerUnit ?? 0}/MP`;
    case 'per-second':
      return `${model.costPerUnit ?? 0}/sec`;
    default:
      return model.cost ? `${model.cost}` : '';
  }
}

export function getBrandIconLetter(brandLabel: string): string {
  return brandLabel.charAt(0).toUpperCase();
}

export function getCostTierDisplay(
  costTier?: CostTier,
): { symbol: string; colorClass: string } | null {
  if (!costTier) {
    return null;
  }
  return COST_TIER_DISPLAY[costTier] ?? null;
}

const QUALITY_TIER_LEVEL: Record<QualityTier, number> = {
  [QualityTier.BASIC]: 1,
  [QualityTier.STANDARD]: 2,
  [QualityTier.HIGH]: 3,
  [QualityTier.ULTRA]: 4,
};

export function getQualityTierLevel(qualityTier?: QualityTier): number {
  if (!qualityTier) {
    return 0;
  }
  return QUALITY_TIER_LEVEL[qualityTier] ?? 0;
}

export function hasModelAudio(model: IModel): boolean {
  return model.hasSpeech === true || model.hasAudioToggle === true;
}

/**
 * Capabilities the row shows as icons. Audio and speed are the two facts that
 * change which model an operator picks at a glance — everything else stays in
 * the hover spec so the row can hold one line.
 */
export function getModelRowCapabilities(
  model: IModel,
): ModelSelectorCapability[] {
  const capabilities: ModelSelectorCapability[] = [];

  if (hasModelAudio(model)) {
    capabilities.push({ icon: Volume2, id: 'audio', label: 'Audio' });
  }

  if (model.speedTier === SpeedTier.FAST) {
    capabilities.push({ icon: Zap, id: 'fast', label: 'Fast' });
  }

  return capabilities;
}

/** The full capability set, shown as chips inside the hover spec panel. */
export function getModelSpecCapabilities(
  model: IModel,
): ModelSelectorCapability[] {
  const capabilities = getModelRowCapabilities(model);

  if (model.hasEndFrame) {
    capabilities.push({ icon: Film, id: 'end-frame', label: 'End frame' });
  }

  if (model.hasInterpolation) {
    capabilities.push({
      icon: Layers,
      id: 'interpolation',
      label: 'Interpolation',
    });
  }

  if (typeof model.maxReferences === 'number' && model.maxReferences > 0) {
    capabilities.push({
      icon: Images,
      id: 'references',
      label: `${model.maxReferences} reference${model.maxReferences === 1 ? '' : 's'}`,
    });
  }

  if (model.hasResolutionOptions) {
    capabilities.push({
      icon: Wand2,
      id: 'resolutions',
      label: 'Resolution options',
    });
  }

  return capabilities;
}

export const MODEL_FILTER_ALL = 'all';
export const MODEL_FILTER_LEGACY = 'legacy';
export const MODEL_FILTER_AUDIO = 'audio';
export const MODEL_FILTER_FAST = 'fast';
export const MODEL_FILTER_CHEAP = 'cheap';
export const MODEL_FILTER_SOURCE_PREFIX = 'source:';

export function isSourceFilter(filterId: string): boolean {
  return filterId.startsWith(MODEL_FILTER_SOURCE_PREFIX);
}

export function getSourceFilterGroup(filterId: string): string {
  return filterId.slice(MODEL_FILTER_SOURCE_PREFIX.length);
}

/**
 * One active filter at a time. Legacy is the only filter that opts *into*
 * deprecated rows; every other view hides them unless a search matches.
 */
export function matchesModelFilter(
  option: ModelSelectorOption,
  filterId: string,
): boolean {
  if (filterId === MODEL_FILTER_LEGACY) {
    return option.isDeprecated;
  }

  if (option.isDeprecated) {
    return false;
  }

  switch (filterId) {
    case MODEL_FILTER_ALL:
      return true;
    case MODEL_FILTER_AUDIO:
      return hasModelAudio(option.model);
    case MODEL_FILTER_FAST:
      return option.model.speedTier === SpeedTier.FAST;
    case MODEL_FILTER_CHEAP:
      return option.costTier === CostTier.LOW;
    default:
      return isSourceFilter(filterId)
        ? option.sourceGroup === getSourceFilterGroup(filterId)
        : true;
  }
}

export function buildModelSearchText(option: ModelSelectorOption): string {
  return [
    option.model.label,
    option.brandLabel,
    option.familyLabel,
    option.variantLabel,
    option.model.description ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

export function matchesModelSearch(
  option: ModelSelectorOption,
  normalizedSearchTerm: string,
): boolean {
  return buildModelSearchText(option).includes(normalizedSearchTerm);
}

/**
 * Ranked flat order: brand, then family, then variant. Variants of one family
 * stay adjacent without needing a header to hold them together.
 */
export function sortModelOptions(
  options: ModelSelectorOption[],
): ModelSelectorOption[] {
  return [...options].sort((left, right) => {
    const byBrand = left.brandLabel.localeCompare(right.brandLabel);
    if (byBrand !== 0) {
      return byBrand;
    }

    const byFamily = left.familyLabel.localeCompare(right.familyLabel);
    if (byFamily !== 0) {
      return byFamily;
    }

    return left.variantLabel.localeCompare(right.variantLabel, undefined, {
      numeric: true,
    });
  });
}

/** Recents keep their own recency order, so they are ordered by key, not name. */
export function orderOptionsByKeys(
  options: ModelSelectorOption[],
  orderedKeys: readonly string[],
): ModelSelectorOption[] {
  const optionsByKey = new Map(
    options.map((option) => [option.model.key, option]),
  );

  return orderedKeys.reduce<ModelSelectorOption[]>((acc, key) => {
    const option = optionsByKey.get(key);
    if (option) {
      acc.push(option);
    }
    return acc;
  }, []);
}
