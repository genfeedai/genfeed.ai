import type { LoggerService } from '@libs/logger/logger.service';
import type { ClientService } from '@mcp/services/client.service';
import { organizationRequiredToolResult } from '@mcp/services/mcp-organization-required-result.util';
import {
  type McpResultScope,
  readNamedBrandId,
  withResultScope,
} from '@mcp/services/mcp-organization-scope-result.util';
import type { McpAppResult } from '@mcp/shared/interfaces/mcp-app.interface';
import { loadOrganizationChoices } from '@mcp/tools/account-management.tool';
import {
  isOrganizationExemptCall,
  mcpToolFailureResult,
  readRequestedOrganization,
  resolveRequestedOrganization,
} from '@mcp/tools/requested-organization.util';

interface OrganizationCall {
  arguments?: Record<string, unknown>;
  name: string;
}

interface OrganizationCallContext {
  /** The user let this connection act in all of their organizations. */
  canSwitchOrganizations: boolean;
  client: ClientService;
  logger: Pick<LoggerService, 'warn'>;
}

/** The brand a call names, read from the organization it runs in; undefined when none or the lookup fails. */
async function findNamedBrand(
  client: ClientService,
  args: Record<string, unknown>,
): Promise<McpResultScope['brand']> {
  const brandId = readNamedBrandId(args);
  if (!brandId) return undefined;
  try {
    const brand = (await client.listBrands()).find(
      (candidate) => candidate.id === brandId,
    );
    return brand ? { id: brand.id, label: brand.label } : undefined;
  } catch {
    return undefined;
  }
}

/** An organizations listing read for one organization marks that one active, as no organization is stored on the connection. */
function markOrganizationActive<T extends McpAppResult>(
  result: T,
  organizationId: string,
): T {
  const data = result.structuredContent?.data;
  if (typeof data !== 'object' || data === null) return result;
  const { organizations } = data as { organizations?: { id: string }[] };
  if (!Array.isArray(organizations)) return result;
  return {
    ...result,
    structuredContent: {
      ...result.structuredContent,
      data: {
        ...data,
        activeOrganizationId: organizationId,
        organizations: organizations.map((org) => ({
          ...org,
          isActive: org.id === organizationId,
        })),
      },
    },
  };
}

/**
 * Runs a tool call in the organization it names. On a connection that covers
 * several organizations a call that names none is refused with the list, never
 * answered from a default, and a result names the organization and brand it
 * acted in.
 */
export async function runInNamedOrganization<T extends McpAppResult>(
  context: OrganizationCallContext,
  call: OrganizationCall,
  run: (args: Record<string, unknown>) => Promise<T>,
) {
  const { canSwitchOrganizations, client, logger } = context;
  const scoped = readRequestedOrganization(call.arguments);
  try {
    if (!scoped) {
      if (
        !canSwitchOrganizations ||
        isOrganizationExemptCall(call.name, call.arguments)
      ) {
        return await run(call.arguments ?? {});
      }
      const { brandsByOrganization, isSwitchable, organizations } =
        await loadOrganizationChoices(client, true);
      return isSwitchable
        ? organizationRequiredToolResult(organizations, brandsByOrganization)
        : await run(call.arguments ?? {});
    }
    const { id, label, slug } = await resolveRequestedOrganization(
      client,
      scoped.organization,
    );
    return await client.runInOrganization(id, async () => {
      const result = await run(scoped.rest);
      return isOrganizationExemptCall(call.name, scoped.rest)
        ? markOrganizationActive(result, id)
        : withResultScope(result, {
            brand: await findNamedBrand(client, scoped.rest),
            organization: { id, label, slug },
          });
    });
  } catch (error: unknown) {
    logger.warn('MCP tool call stopped during organization selection');
    return mcpToolFailureResult(error);
  }
}
