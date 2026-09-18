import type { ModelBrandIconKey } from '../../constants/model-brands.constant';

/**
 * One brand tile in the providers wall.
 *
 * Derived from the model catalog rather than hand-maintained, so a brand
 * appears the day its first model is wired and its counts never drift from
 * what the app can actually run.
 */
export interface ProviderBrand {
  slug: string;
  label: string;
  color: string;
  iconKey?: ModelBrandIconKey;
  modelCount: number;
  categories: string[];
}
