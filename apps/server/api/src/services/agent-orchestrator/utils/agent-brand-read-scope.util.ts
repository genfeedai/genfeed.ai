import type { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { isCloudDeployment } from '@genfeedai/config';

export type BrandReadScope = {
  brand?: { is: Awaited<ReturnType<BrandAccessService['predicate']>> };
};

/**
 * The `where` fragment that limits a post read to the brands this connection
 * can access. Empty on a self-hosted install, which does not filter by brand.
 * Every `get_posts` mode (one post, list, calendar) applies it.
 */
export function brandReadScope(
  brandAccessService: Pick<BrandAccessService, 'predicate'>,
  ctx: ToolExecutionContext,
): Promise<BrandReadScope> {
  if (!isCloudDeployment()) return Promise.resolve({});
  return brandAccessService
    .predicate({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      ...ctx.apiKeyContext,
    })
    .then((is) => ({ brand: { is } }));
}
