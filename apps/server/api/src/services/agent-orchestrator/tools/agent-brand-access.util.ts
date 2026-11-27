import type { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { isCloudDeployment } from '@genfeedai/config';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { traced } from '@libs/tracing/traced';

/**
 * Said when an organization has brands but the caller can use none of them.
 * It never suggests creating a brand: the brands exist, access is what is missing.
 */
export const BRAND_ACCESS_MISSING_MESSAGE =
  'No brand is available to this connection. The organization has brands, but the brand access of this connection and your brand assignments allow none of them. An organization owner or admin can review both.';

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

interface BrandFindOne {
  findOne: (
    query: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | null>;
}

/**
 * A brand reader limited to the brands this connection may use. Self-hosted
 * deployments read every brand of the organization.
 */
export const authorizedBrandReader = traced(
  'authorizedBrandReader',
  async (
    brandsService: BrandFindOne,
    brandAccessService: BrandAccessService,
    ctx: ToolExecutionContext,
  ): Promise<BrandFindOne> => {
    if (!isCloudDeployment()) return brandsService;
    const where = await brandAccessService.predicate({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      ...ctx.apiKeyContext,
    });
    return {
      findOne: (query) => brandsService.findOne({ AND: [query, where] }),
    };
  },
);

/**
 * With several brands the member's current brand is only a guess that files an
 * upload under whichever brand they last opened (#11076 follow-up: Koro photos
 * landed in another brand's Library), so the caller has to name one. Null when
 * a single brand applies.
 */
export function severalBrandsUploadFailure(
  brands: ReadonlyArray<{ id: string; label: string }>,
): AgentToolResult | null {
  if (brands.length < 2) return null;
  const names = brands.map((brand) => `${brand.label} (${brand.id})`);
  return {
    creditsUsed: 0,
    error: `This organization has several brands. Pass brandId to say which brand owns the upload: ${names.join(', ')}.`,
    success: false,
  };
}
