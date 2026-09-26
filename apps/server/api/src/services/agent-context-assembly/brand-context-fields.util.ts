import type { IBrandKitResolvedAssets } from '@genfeedai/contracts/interfaces';
import type { BrandKitSourceBrand } from '@genfeedai/helpers';

/**
 * Pure Brand-row/brand-kit field readers shared by
 * `AgentContextAssemblyService.createBrandContext` (visual identity) and
 * `toBrandKitSourceBrand` (readiness scoring). Split out of that service
 * purely to keep it under the runtime-complexity file-size guard (#5144
 * follow-up); no `this` state, so these are stateless functions rather than
 * class methods.
 */

export function readTextField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

export function readUrlField(value: unknown): string | undefined {
  return readTextField(value);
}

export function readNonDefaultColor(
  value: unknown,
  defaultValue: string,
): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  return value.trim().toLowerCase() === defaultValue.toLowerCase()
    ? undefined
    : value;
}

export function readReferenceImages(value: unknown): Array<{
  category: string;
  label?: string;
  url: string;
}> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((img) => {
    if (typeof img === 'string') {
      return readUrlField(img) ? [{ category: 'reference', url: img }] : [];
    }

    if (!img || typeof img !== 'object' || Array.isArray(img)) {
      return [];
    }

    const record = img as Record<string, unknown>;
    const url = readUrlField(record.url);
    if (!url) {
      return [];
    }

    return [
      {
        category: readTextField(record.category) ?? 'reference',
        label: readTextField(record.label),
        url,
      },
    ];
  });
}

/**
 * Reference images come from two places: the legacy `Brand.referenceImages`
 * JSON column (still written by the onboarding upload path) and `Asset` rows
 * imported through the brand kit. Both are real; neither supersedes the
 * other, so the prompt gets the union, deduplicated by URL.
 */
export function mergeReferenceImages(
  value: unknown,
  assets: IBrandKitResolvedAssets,
): Array<{ category: string; label?: string; url: string }> {
  const merged = readReferenceImages(value);
  const seenUrls = new Set(merged.map((image) => image.url));

  for (const reference of assets.references) {
    if (seenUrls.has(reference.url)) {
      continue;
    }

    seenUrls.add(reference.url);
    merged.push({
      category: 'reference',
      label: reference.label,
      url: reference.url,
    });
  }

  return merged;
}

export function toBrandKitSourceBrand(
  brand: Record<string, unknown>,
  assets: IBrandKitResolvedAssets,
): BrandKitSourceBrand {
  const source: BrandKitSourceBrand = {
    agentConfig:
      brand.agentConfig &&
      typeof brand.agentConfig === 'object' &&
      !Array.isArray(brand.agentConfig)
        ? (brand.agentConfig as BrandKitSourceBrand['agentConfig'])
        : undefined,
    backgroundColor: readTextField(brand.backgroundColor),
    bannerUrl: assets.banner?.url,
    description: readTextField(brand.description),
    fontFamily: readTextField(brand.fontFamily),
    id: readTextField(brand.id) ?? 'unknown-brand',
    label: readTextField(brand.label),
    logoUrl: assets.logo?.url,
    organization: readTextField(brand.organizationId),
    primaryColor: readTextField(brand.primaryColor),
    referenceImages: mergeReferenceImages(brand.referenceImages, assets),
    secondaryColor: readTextField(brand.secondaryColor),
    text: readTextField(brand.text),
  };

  return source;
}
