import type { AgentScopeContextService } from '@api/agent-context/agent-scope-context.service';
import { getActionOriginContext } from '@api/index';
import { assertAgentPublishingScope } from '@api/services/agent-orchestrator/tools/agent-publish-scope.util';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import { ActionOrigin } from '@genfeedai/contracts';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { traced } from '@libs/tracing/traced';
import { BadRequestException } from '@nestjs/common';

const MCP_CREATE_POST_DRAFT_ONLY_ERROR =
  'create_post on the MCP surface only creates a draft and does not publish. Publish with create_scheduled_release.';

export function mcpDraftOnlyResult(): AgentToolResult {
  return {
    creditsUsed: 0,
    error: MCP_CREATE_POST_DRAFT_ONLY_ERROR,
    success: false,
  };
}

export function isMcpActionOrigin(): boolean {
  return getActionOriginContext().origin === ActionOrigin.MCP;
}

export function readPublishContentId(
  params: Record<string, unknown>,
): string | undefined {
  if (typeof params.contentId === 'string' && params.contentId.trim()) {
    return params.contentId.trim();
  }
  if (typeof params.ingredientId === 'string' && params.ingredientId.trim()) {
    return params.ingredientId.trim();
  }
  return undefined;
}

/** MCP may create a text draft. Publishing and confirmed writes stay on create_scheduled_release. */
export function blockMcpCreatePost(
  params: Record<string, unknown>,
): AgentToolResult | undefined {
  if (!isMcpActionOrigin()) {
    return undefined;
  }
  if (params.confirmed === true || readPublishContentId(params)) {
    return mcpDraftOnlyResult();
  }
  return undefined;
}

/**
 * Authorizes saving a text draft. A thread turn carries a validated scope and
 * keeps the publishing-scope assertion. An MCP call has no thread, so no
 * validated scope: the draft is saved under the brand the caller names, and
 * the server proves that brand belongs to the caller before anything is saved.
 */
export const authorizeAgentTextDraft = traced(
  'authorizeAgentTextDraft',
  async (
    agentScopeContextService: AgentScopeContextService | undefined,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<void> => {
    if (!isMcpActionOrigin() || ctx.validatedScope) {
      await assertAgentPublishingScope(
        agentScopeContextService,
        ctx,
        ctx.validatedScope?.brandId,
        'post creation',
      );
      return;
    }
    const brandId = readOptionalString(params.brandId);
    if (!brandId) {
      throw new BadRequestException(
        'brandId is required to save a post draft.',
      );
    }
    if (!agentScopeContextService) {
      throw new Error(
        'Agent scope validation is required before saving a post draft.',
      );
    }
    await agentScopeContextService.assertBrandAuthorized(brandId, {
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      ...ctx.apiKeyContext,
    });
  },
);
