import { isCloudDeployment } from '@genfeedai/config';
import { RouterPriority } from '@genfeedai/contracts';
import { getFallbackImageModelKey } from '@genfeedai/contracts/constants';
import type { IBrandKitResolvedAssets } from '@genfeedai/contracts/interfaces';

const FIRST_RUN_REFERENCE_LIMIT = 10;

/**
 * First-run images are a light, standard-resolution preview, never an HQ
 * render. Hosted production pins Nano Banana 2 Lite; local, self-hosted, and
 * test keep the cheapest key. Priority is always COST, and callers size the
 * request at the standard ~1024px execution dimensions with no resolution
 * override.
 */
export function resolveFirstRunImageRouting(input: { nodeEnv?: string }): {
  autoSelectModel: false;
  model: string;
  prioritize: RouterPriority;
} {
  return {
    autoSelectModel: false,
    model: getFallbackImageModelKey({
      isCloud: isCloudDeployment(),
      nodeEnv: input.nodeEnv,
    }),
    prioritize: RouterPriority.COST,
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
  nodeEnv?: string;
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
  const routing = resolveFirstRunImageRouting({
    nodeEnv: input.nodeEnv,
  });
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
