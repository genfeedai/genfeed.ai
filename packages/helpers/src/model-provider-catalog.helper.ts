import { ModelCategory } from '@genfeedai/contracts';
import {
  extractBrandFromKey,
  getBrandConfig,
  MODEL_KEYS,
  MODEL_OUTPUT_CAPABILITIES,
} from '@genfeedai/contracts/constants';
import type { ProviderBrand } from '@genfeedai/contracts/interfaces';

/**
 * Human labels for the categories a provider tile advertises. Several Prisma
 * categories collapse into one product word — an upscaler and an editor are
 * both "image" work as far as the marketing wall is concerned.
 */
const CATEGORY_LABELS: Partial<Record<ModelCategory, string>> = {
  [ModelCategory.EMBEDDING]: 'Embeddings',
  [ModelCategory.IMAGE]: 'Image',
  [ModelCategory.IMAGE_EDIT]: 'Image',
  [ModelCategory.IMAGE_UPSCALE]: 'Image',
  [ModelCategory.MUSIC]: 'Music',
  [ModelCategory.TEXT]: 'Text',
  [ModelCategory.VIDEO]: 'Video',
  [ModelCategory.VIDEO_EDIT]: 'Video',
  [ModelCategory.VIDEO_UPSCALE]: 'Video',
  [ModelCategory.VOICE]: 'Voice',
};

const CATEGORY_ORDER: readonly string[] = [
  'Image',
  'Video',
  'Voice',
  'Music',
  'Text',
  'Embeddings',
];

/**
 * Groups the model catalog by brand.
 *
 * The homepage wall is generated from this rather than a curated logo list, so
 * a provider shows up the moment its first model key lands and disappears when
 * the last one is removed — there is no second list to forget to update.
 */
export function getProviderBrands(): ProviderBrand[] {
  const byBrand = new Map<string, { count: number; categories: Set<string> }>();

  for (const modelKey of Object.values(MODEL_KEYS)) {
    const slug = extractBrandFromKey(modelKey);
    const entry = byBrand.get(slug) ?? { categories: new Set(), count: 0 };
    entry.count += 1;

    const capability = MODEL_OUTPUT_CAPABILITIES[modelKey];
    const label = capability ? CATEGORY_LABELS[capability.category] : undefined;
    if (label) {
      entry.categories.add(label);
    }

    byBrand.set(slug, entry);
  }

  return [...byBrand.entries()]
    .map(([slug, entry]) => {
      const config = getBrandConfig(slug);
      return {
        categories: CATEGORY_ORDER.filter((label) =>
          entry.categories.has(label),
        ),
        color: config.color,
        iconKey: config.iconKey,
        label: config.label,
        modelCount: entry.count,
        slug,
      };
    })
    .sort(
      (left, right) =>
        right.modelCount - left.modelCount ||
        left.label.localeCompare(right.label),
    );
}
