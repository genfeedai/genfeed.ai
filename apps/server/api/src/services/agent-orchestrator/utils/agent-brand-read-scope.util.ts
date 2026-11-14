import type { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { isCloudDeployment } from '@genfeedai/config';

export type BrandReadScope = {
  brand?: { is: Awaited<ReturnType<BrandAccessService['predicate']>> };
};

/**
 * The `where` fragment that limits a post read to the brands this connection
 * can access. A self-hosted install does not filter by brand, unless the API
 * key is limited to some brands: then it reaches only those. Every `get_posts`
 * mode (one post, list, calendar) applies it.
 */
export function brandReadScope(
  brandAccessService: Pick<BrandAccessService, 'predicate'> | undefined,
  ctx: ToolExecutionContext,
): Promise<BrandReadScope> {
  if (!brandAccessService) {
    return isCloudDeployment()
      ? Promise.reject(new Error('Brand access is unavailable'))
      : Promise.resolve({});
  }
  return brandAccessService
    .predicate({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      ...ctx.apiKeyContext,
    })
    .then((is) =>
      !isCloudDeployment() && is.id === undefined ? {} : { brand: { is } },
    );
}
