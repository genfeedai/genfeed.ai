import type { JSONValue } from '@growthbook/growthbook-react';
import { GrowthBookContext } from '@growthbook/growthbook-react';
import { useContext } from 'react';

/**
 * Returns the value of a feature flag with a typed default.
 *
 * @param flagKey - The feature flag key defined in GrowthBook
 * @param defaultValue - Fallback value when the flag is missing or GrowthBook is unavailable
 * @returns The resolved flag value, or `defaultValue`
 *
 * @example
 * ```tsx
 * const maxItems = useFeatureValue('max_gallery_items', 20);
 * const bannerText = useFeatureValue('promo_banner_text', '');
 * ```
 */
export function useFeatureValue<T extends JSONValue>(
  flagKey: string,
  defaultValue: T,
): T {
  const growthBookContext = useContext(GrowthBookContext);

  return (growthBookContext?.growthbook?.getFeatureValue(
    flagKey as never,
    defaultValue,
  ) ?? defaultValue) as T;
}
