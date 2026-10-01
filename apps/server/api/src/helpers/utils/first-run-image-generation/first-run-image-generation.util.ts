import { isCloudDeployment } from '@genfeedai/config';
import { RouterPriority } from '@genfeedai/contracts';
import {
  getFallbackImageModelKey,
  shouldUseLowestCostModelDefaults,
} from '@genfeedai/contracts/constants';
import type { IBrandKitResolvedAssets } from '@genfeedai/contracts/interfaces';

const FIRST_RUN_REFERENCE_LIMIT = 10;

/**
 * Hosted production first-run images pin the cloud quality catalogue so the
 * prompt harness is visible. Local, self-hosted, and test keep the cheapest
 * key so those environments do not bill flagship rates.
 */
export function resolveFirstRunImageRouting(): {
  autoSelectModel: false;
  model: string;
  prioritize: RouterPriority;
} {
  const input = {
    isCloud: isCloudDeployment(),
    nodeEnv: process.env.NODE_ENV,
  };

  return {
    autoSelectModel: false,
    model: getFallbackImageModelKey(input),
    prioritize: shouldUseLowestCostModelDefaults(input)
      ? RouterPriority.COST
      : RouterPriority.QUALITY,
  };
}

/**
 * Brand-kit reference ids first, then logo and banner, capped to the image
 * generation DTO limit. Logo/banner resolve through the reference lookup
 * once those asset categories are accepted as visual ground truth.
 */
export function collectFirstRunReferenceIds(
  assets: IBrandKitResolvedAssets | null | undefined,
): string[] {
  if (!assets) {
    return [];
  }

  const ids = [
    ...assets.references.map((item) => item.id),
    assets.logo?.id,
    assets.banner?.id,
  ].filter((id): id is string => Boolean(id));

  return [...new Set(ids)].slice(0, FIRST_RUN_REFERENCE_LIMIT);
}
