import { formatAgentError } from '@genfeedai/agent/server';
import type { ClientService } from '@mcp/services/client.service';
import { matchOrganization } from '@mcp/tools/account-management.tool';
import { toMcpToolErrorResult } from '@mcp/tools/mcp-tool-error';

/** Tools whose own `organization` argument is not a per-call organization. */
const OWN_ORGANIZATION_ARGUMENT_TOOLS: ReadonlySet<string> = new Set([
  'get_orgs',
  'switch_org',
]);

/**
 * Splits the `organization` a call names (a connection the user authorized for
 * all of their organizations may name one on any call) from the arguments the
 * tool itself receives. Null when the call names none.
 */
export function readRequestedOrganization(
  toolName: string,
  args: Record<string, unknown> | undefined,
): { organization: unknown; rest: Record<string, unknown> } | null {
  const { organization, ...rest } = args ?? {};
  return organization === undefined ||
    OWN_ORGANIZATION_ARGUMENT_TOOLS.has(toolName)
    ? null
    : { organization, rest };
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
 * slug or id from get_orgs). A connection limited to one organization is
 * refused instead of being answered from the wrong one.
 */
export async function resolveRequestedOrganizationId(
  client: Pick<ClientService, 'canSwitchOrganizations' | 'listOrganizations'>,
  requested: unknown,
): Promise<string> {
  const wanted = typeof requested === 'string' ? requested.trim() : '';
  if (!wanted) {
    throw new Error('organization must be a name, slug or id from get_orgs.');
  }
  if (!(await client.canSwitchOrganizations())) {
    throw new Error(
      'This connection is limited to one organization. Reconnect and choose "All my organizations" to act in several.',
    );
  }
  return matchOrganization(await client.listOrganizations(), wanted).id;
}
