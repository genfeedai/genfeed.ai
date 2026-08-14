import {
  COST_TIER_DISPLAY,
  extractBrandFromKey,
  getBrandConfig,
} from '@genfeedai/constants';
import type { CostTier } from '@genfeedai/enums';
import { getModelBrandIcon } from '@genfeedai/helpers/ui/icons/model-brand-icon';
import type { IModel } from '@genfeedai/interfaces';
import type { ModelSelectorOption } from '@genfeedai/props/ui/model-selector/model-selector.props';

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

export function shouldRenderModelFamilyHeader(variantCount: number): boolean {
  return variantCount > 1;
}

export function isModelFamilyExpanded({
  familyKey,
  hasSearchMatch,
  toggledFamilyKeys,
}: {
  familyKey: string;
  hasSearchMatch: boolean;
  toggledFamilyKeys: readonly string[];
}): boolean {
  return hasSearchMatch || toggledFamilyKeys.includes(familyKey);
}

export function isModelBrandGroupExpanded({
  brandSlug,
  visibleBrandCount,
  hasSearchMatch,
  activeBrand,
  toggledBrandKeys,
}: {
  brandSlug: string;
  visibleBrandCount: number;
  hasSearchMatch: boolean;
  activeBrand: string | null;
  toggledBrandKeys: readonly string[];
}): boolean {
  if (hasSearchMatch) {
    return true;
  }
  if (activeBrand === brandSlug) {
    return true;
  }
  if (activeBrand && activeBrand !== 'favorites' && activeBrand !== 'legacy') {
    return false;
  }
  if (visibleBrandCount <= 1) {
    return true;
  }
  return toggledBrandKeys.includes(brandSlug);
}

export function transformModelsToOptions(
  models: IModel[],
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

export function collectBrandsFromOptions(
  options: ModelSelectorOption[],
): Array<{ slug: string; label: string; color: string; count: number }> {
  const brandMap = new Map<
    string,
    { label: string; color: string; count: number }
  >();

  for (const option of options) {
    const existing = brandMap.get(option.brandSlug);
    if (existing) {
      existing.count++;
    } else {
      brandMap.set(option.brandSlug, {
        color: option.brandColor,
        count: 1,
        label: option.brandLabel,
      });
    }
  }

  return Array.from(brandMap.entries())
    .map(([slug, data]) => ({ slug, ...data }))
    .sort((a, b) => b.count - a.count);
}
