import { resolveGenerationBrand } from '@api/collections/brands/utils/resolve-generation-brand.util';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type {
  AgentBrandsServiceLike,
  AgentMembersServiceLike,
} from '@api/services/agent-orchestrator/tools/agent-workflow-tool.types';

// #5219: explicit param, then thread/route context, then the acting member's
// currentBrandId. No "first brand in the org" guess — generation always has
// an explicit brand.
export async function resolveWorkflowBrand(
  brandsService: AgentBrandsServiceLike,
  membersService: AgentMembersServiceLike,
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<Record<string, unknown> | null> {
  return resolveGenerationBrand({
    brandsService,
    contextBrandId: ctx.brandId,
    explicitBrandId:
      typeof params.brandId === 'string' ? params.brandId : undefined,
    membersService,
    organizationId: ctx.organizationId,
    userId: ctx.userId,
  });
}

export function tokenizeWorkflowBootstrapText(
  ...values: Array<unknown>
): string[] {
  return values
    .flatMap((value) =>
      String(value || '')
        .toLowerCase()
        .split(/[^a-z0-9]+/g),
    )
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}
