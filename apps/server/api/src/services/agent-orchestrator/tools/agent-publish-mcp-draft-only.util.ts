import { getActionOriginContext } from '@api/index';
import { ActionOrigin } from '@genfeedai/contracts';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';

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
