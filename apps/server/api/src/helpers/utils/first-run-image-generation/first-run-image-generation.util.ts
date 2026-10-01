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

export type FirstRunOnboardingImageBodyInput = {
  brandId?: string;
  height: number;
  onReferenceError?: (error: unknown) => void;
  organizationId: string;
  prompt: string;
  resolveBrandKitAssets?: (
    brandId: string,
    organizationId: string,
  ) => Promise<IBrandKitResolvedAssets>;
  runId?: string;
  strategyId?: string;
  width: number;
};

async function readFirstRunBrandVisualReferenceIds(
  input: FirstRunOnboardingImageBodyInput,
): Promise<string[]> {
  if (!input.brandId || !input.resolveBrandKitAssets) {
    return [];
  }

  try {
    return collectFirstRunReferenceIds(
      await input.resolveBrandKitAssets(input.brandId, input.organizationId),
    );
  } catch (error: unknown) {
    input.onReferenceError?.(error);
    return [];
  }
}

export async function buildFirstRunOnboardingImageBody(
  input: FirstRunOnboardingImageBodyInput,
): Promise<Record<string, unknown>> {
  const routing = resolveFirstRunImageRouting();
  const references = await readFirstRunBrandVisualReferenceIds(input);

  return {
    ...routing,
    height: input.height,
    prompt: input.prompt,
    text: input.prompt,
    waitForCompletion: true,
    width: input.width,
    ...(references.length > 0 ? { references } : {}),
    ...(input.runId ? { workflowExecutionId: input.runId } : {}),
    ...(input.strategyId ? { agentStrategyId: input.strategyId } : {}),
  };
}
