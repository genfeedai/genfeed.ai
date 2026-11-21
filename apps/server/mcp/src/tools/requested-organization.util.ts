import { formatAgentError } from '@genfeedai/agent/server';
import type { OrganizationOption } from '@genfeedai/contracts/interfaces';
import type { ClientService } from '@mcp/services/client.service';
import { matchOrganization } from '@mcp/tools/account-management.tool';
import {
  MCP_ORGANIZATION_BOUND,
  toMcpToolErrorResult,
} from '@mcp/tools/mcp-tool-error';
import { ForbiddenException } from '@nestjs/common';

/**
 * Calls that work without naming an organization: they are how a caller learns
 * which organizations it has, and an approval already belongs to one.
 */
export function isOrganizationExemptCall(
  toolName: string,
  args: Record<string, unknown> | undefined,
): boolean {
  if (toolName === 'find_tools' || toolName === 'resolve_approval') return true;
  return toolName === 'get_context' && args?.action === 'organizations';
}

/**
 * Splits the `organization` a call names (a connection the user authorized for
 * all of their organizations may name one on any call) from the arguments the
 * tool itself receives. Null when the call names none.
 */
export function readRequestedOrganization(
  args: Record<string, unknown> | undefined,
): { organization: unknown; rest: Record<string, unknown> } | null {
  const { organization, ...rest } = args ?? {};
  return organization === undefined ? null : { organization, rest };
}

/** The result a failed tool call returns to the client. */
export function mcpToolFailureResult(error: unknown) {
  const gated = toMcpToolErrorResult(error);
  if (gated) return gated;
  return {
    content: [
      {
        text: `Error: ${(error as Error)?.message ?? String(error)}`,
        type: 'text' as const,
      },
    ],
    structuredContent: {
      failure: {
        ...formatAgentError(
          error instanceof Error ? error.message : String(error),
        ),
        detail: null,
      },
    },
    isError: true,
  };
}

/**
 * The organization a tool call names with its `organization` argument (a name,
 * slug or id from get_context(action=organizations)). A connection limited to one organization is
 * refused instead of being answered from the wrong one.
 */
export async function resolveRequestedOrganization(
  client: Pick<ClientService, 'canSwitchOrganizations' | 'listOrganizations'>,
  requested: unknown,
): Promise<OrganizationOption> {
  const wanted = typeof requested === 'string' ? requested.trim() : '';
  if (!wanted) {
    throw new Error(
      'organization must be a name, slug or id from get_context(action=organizations).',
    );
  }
  if (!(await client.canSwitchOrganizations())) {
    throw new ForbiddenException({
      code: MCP_ORGANIZATION_BOUND,
      message:
        'This connection is limited to one organization. Reconnect and choose "All organizations" to act in several.',
    });
  }
  return matchOrganization(await client.listOrganizations(), wanted);
}
