import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type { AgentBrandsServiceLike } from '@api/services/agent-orchestrator/tools/agent-workflow-tool.types';

export async function resolveWorkflowBrand(
  brandsService: AgentBrandsServiceLike,
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<Record<string, unknown> | null> {
  if (typeof params.brandId === 'string') {
    const explicitBrand = await brandsService.findOne({
      id: params.brandId,
      organizationId: ctx.organizationId,
    });

    if (explicitBrand) {
      return explicitBrand as unknown as Record<string, unknown>;
    }
  }

  // Prefer run/thread brand (URL → thread.brandId) before brands.isSelected.
  if (ctx.brandId) {
    const contextBrand = await brandsService.findOne({
      id: ctx.brandId,
      organizationId: ctx.organizationId,
    });

    if (contextBrand) {
      return contextBrand as unknown as Record<string, unknown>;
    }
  }

  const currentBrand = await brandsService.findOne({
    isSelected: true,
    organizationId: ctx.organizationId,
    userId: ctx.userId,
  });

  if (currentBrand) {
    return currentBrand as unknown as Record<string, unknown>;
  }

  const firstOrgBrand = await brandsService.findOne({
    organizationId: ctx.organizationId,
  });

  return firstOrgBrand as unknown as Record<string, unknown> | null;
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
