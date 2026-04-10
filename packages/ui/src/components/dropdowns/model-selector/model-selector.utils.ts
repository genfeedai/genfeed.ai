import {
  COST_TIER_DISPLAY,
  extractBrandFromKey,
  getBrandConfig,
} from '@genfeedai/constants/model-brands.constant';
import type { CostTier } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import type { ModelSelectorOption } from '@genfeedai/props/ui/model-selector/model-selector.props';

type ModelWithLifecycle = IModel & {
  deprecatedAt?: string | Date;
  isDeprecated?: boolean;
};

const KNOWN_VARIANT_SUFFIXES = new Set([
  'base',
  'dev',
  'fast',
  'flash',
  'high',
  'lite',
  'max',
  'mini',
  'pro',
  'slow',
  'standard',
  'turbo',
  'ultra',
]);

function titleCaseToken(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((token) =>
      token.length <= 3 && token === token.toUpperCase()
        ? token
        : token.charAt(0).toUpperCase() + token.slice(1).toLowerCase(),
    )
    .join(' ');
}

function formatVersion(version: string): string {
  return version.includes('.') ? version : `${version}.0`;
}

function humanizeSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((token) => {
      if (/^\d+(?:\.\d+)?$/.test(token)) {
        return formatVersion(token);
      }
      return titleCaseToken(token);
    })
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

  const suffixMatch = modelSlug.match(/^(.+)-([a-z0-9-]+)$/i);
  if (suffixMatch) {
    const [, baseSlug, suffix] = suffixMatch;
    if (KNOWN_VARIANT_SUFFIXES.has(suffix.toLowerCase())) {
      return {
        familyKey: `${brandSlug}:${baseSlug}`,
        familyLabel: humanizeSlug(baseSlug),
        variantLabel: titleCaseToken(suffix),
      };
    }
  }

  return {
    familyKey: `${brandSlug}:${modelSlug}`,
    familyLabel: getFallbackFamilyLabel(model.label),
    variantLabel: 'Base',
  };
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
      brandIcon: brandConfig.icon,
      brandLabel: brandConfig.label,
      brandSlug,
      costTier: model.costTier as CostTier | undefined,
      familyKey: family.familyKey,
      familyLabel: family.familyLabel,
      isDeprecated: (model as ModelWithLifecycle).isDeprecated === true,
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
