import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ClientService } from '@mcp/services/client.service';

/**
 * A connection that may act in all of the user's organizations says so in
 * `get_account`: the organization it started in (`isDefault`) and the others it
 * can name. The Claude connector has no `get_orgs`, so this is where it learns
 * the default it was given. A failed lookup leaves the result as it was.
 */
export async function withAccountOrganizations(
  result: AgentToolResult,
  name: string,
  client: Pick<ClientService, 'canSwitchOrganizations' | 'listOrganizations'>,
  logger: Pick<LoggerService, 'warn'>,
): Promise<AgentToolResult> {
  if (!result.success || name !== 'get_account' || !isRecord(result.data))
    return result;
  try {
    if (!(await client.canSwitchOrganizations())) return result;
    const organizations = await client.listOrganizations();
    if (organizations.length < 2) return result;
    return {
      ...result,
      data: {
        ...result.data,
        organizations: organizations.map((organization) => ({
          isDefault: organization.isActive,
          name: organization.label,
        })),
      },
    };
  } catch (error: unknown) {
    logger.warn('Could not list organizations for get_account', error);
    return result;
  }
}
