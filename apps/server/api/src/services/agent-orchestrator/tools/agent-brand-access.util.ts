import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { isCloudDeployment } from '@genfeedai/config';
import { traced } from '@libs/tracing/traced';

/**
 * Said when an organization has brands but the caller can use none of them.
 * It never suggests creating a brand: the brands exist, access is what is missing.
 */
export const BRAND_ACCESS_MISSING_MESSAGE =
  'You have no brand access in this organization. It has brands, but none are assigned to you or to this API key. Ask an organization owner or admin to give you access to a brand.';

export interface AgentBrandCounter {
  count?: (filter: Record<string, unknown>) => Promise<number>;
}

/**
 * Brands in the organization regardless of the caller's brand access, so an
 * empty list can be told apart from an organization with no brands. Cloud
 * only (self-hosted lists every brand). Undefined when the count fails.
 */
export const countOrganizationBrands = traced(
  'countOrganizationBrands',
  async (
    brands: AgentBrandCounter,
    ctx: ToolExecutionContext,
  ): Promise<number | undefined> => {
    if (!isCloudDeployment()) return undefined;
    try {
      return await brands.count?.({
        isDeleted: false,
        organizationId: ctx.organizationId,
      });
    } catch {
      return undefined;
    }
  },
);

/** `get_brands` data: the list, plus why it is empty when access is missing. */
export const brandListData = traced(
  'brandListData',
  async (
    counter: AgentBrandCounter,
    ctx: ToolExecutionContext,
    brands: unknown[],
  ): Promise<Record<string, unknown>> => {
    if (brands.length > 0) return { brands };
    const organizationBrandCount = await countOrganizationBrands(counter, ctx);
    if (!organizationBrandCount) return { brands };
    return {
      brandAccessMessage: BRAND_ACCESS_MISSING_MESSAGE,
      brands,
      organizationBrandCount,
    };
  },
);
