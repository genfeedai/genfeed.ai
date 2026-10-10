import type { AgentScopeContextService } from '@api/agent-context/agent-scope-context.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';

export async function assertAgentPublishingScope(
  agentScopeContextService: AgentScopeContextService | undefined,
  ctx: ToolExecutionContext,
  resourceBrandId: string | undefined,
  resourceLabel: string,
): Promise<void> {
  if (!ctx.validatedScope || !agentScopeContextService) {
    throw new Error(
      'Validated agent scope is required before publishing side effects.',
    );
  }

  await agentScopeContextService.assertConsequentialBoundary(
    ctx.validatedScope,
    'publish',
  );
  agentScopeContextService.assertResourceBrand(
    ctx.validatedScope,
    resourceBrandId,
    resourceLabel,
  );
}

/**
 * Proves, on the server, that the requested brand belongs to the authenticated
 * organization. The request's own `context.brandId` is only a consistency
 * check, never the authority.
 */
export async function authorizeExternalPublicationBrand(
  agentScopeContextService: AgentScopeContextService | undefined,
  brandId: string,
  ctx: ToolExecutionContext,
): Promise<void> {
  if (!agentScopeContextService) {
    throw new Error(
      'Agent scope validation is required before recording external publications.',
    );
  }
  await agentScopeContextService.assertBrandAuthorized(brandId, {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    ...ctx.apiKeyContext,
  });
  if (ctx.validatedScope) {
    agentScopeContextService.assertResourceBrand(
      ctx.validatedScope,
      brandId,
      'External publication',
    );
  }
}
