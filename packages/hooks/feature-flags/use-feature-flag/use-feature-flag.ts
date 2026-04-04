import { GrowthBookContext } from '@growthbook/growthbook-react';
import { useContext } from 'react';

/**
 * Returns whether a feature flag is enabled.
 * Returns `false` when no GrowthBook provider is available (e.g. missing env vars).
 *
 * @param flagKey - The feature flag key defined in GrowthBook
 * @returns `true` when the flag is on, `false` otherwise
 */
export function useFeatureFlag(flagKey: string): boolean {
  const growthBookContext = useContext(GrowthBookContext);

  return growthBookContext?.growthbook?.isOn(flagKey as never) ?? false;
}
