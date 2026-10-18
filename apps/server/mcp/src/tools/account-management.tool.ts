import type {
  McpMediaToolResult,
  OrganizationOption,
} from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ClientService } from '@mcp/services/client.service';
import { toNativeMcpMediaResult } from '@mcp/services/mcp-media-result.util';
import { formatToolData } from '@mcp/shared/utils/tool-result-text.util';

type AccountManagementToolResult = {
  content: McpMediaToolResult['content'];
  structuredContent?: McpMediaToolResult['structuredContent'];
};

/** Reads that must not fail the whole listing: a hiccup shows fewer details. */
async function bestEffort<T>(read: Promise<T>, fallback: T): Promise<T> {
  try {
    return await read;
  } catch {
    return fallback;
  }
}

function matchOrganization(
  organizations: OrganizationOption[],
  requested: string,
): OrganizationOption {
  const byId = organizations.find((org) => org.id === requested);
  if (byId) return byId;
  const wanted = requested.toLowerCase();
  const byName = organizations.filter(
    (org) =>
      org.label.toLowerCase() === wanted || org.slug.toLowerCase() === wanted,
  );
  if (byName.length === 1) return byName[0];
  throw new Error(
    byName.length > 1
      ? `More than one organization matches "${requested}". Use its id from list_orgs.`
      : `No organization matches "${requested}". Run list_orgs to see yours.`,
  );
}

async function describeOrganizations(
  client: ClientService,
  heading = '',
): Promise<AccountManagementToolResult> {
  const [organizations, canSwitch] = await Promise.all([
    client.listOrganizations(),
    bestEffort(client.canSwitchOrganizations(), false),
  ]);
  const active = organizations.find((org) => org.isActive);
  const brands = await bestEffort(client.listBrands(), []);
  const isSwitchable = canSwitch && organizations.length > 1;
  const readable = organizations.map(
    ({ id, isActive, isOwner, label, slug }) => ({
      ...(isSwitchable ? { id } : {}),
      isActive,
      isOwner,
      label,
      slug,
    }),
  );
  const workingIn = active ? `"${active.label}"` : 'one organization';
  const guidance =
    organizations.length <= 1
      ? ''
      : isSwitchable
        ? `This connection works inside ${workingIn}. Use switch_org with an organization name to work in another.\n\n`
        : `This connection works inside ${workingIn}. To work in another, reconnect and choose it on the consent screen (tick "Switch between my organizations" to move between them later).\n\n`;
  return {
    content: [
      {
        text: `${heading ? `${heading}\n\n` : ''}${guidance}${formatToolData({ brands: brands.map(({ label }) => label), organizations: readable })}`,
        type: 'text' as const,
      },
    ],
    structuredContent: {
      data: {
        ...(active ? { activeOrganizationId: active.id } : {}),
        brands,
        canSwitchOrganizations: isSwitchable,
        organizations,
      },
    },
  };
}

export function handleAccountManagementTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
  mediaOrigins: readonly string[] = [],
  logger?: Pick<LoggerService, 'warn'>,
) {
  const handlers: Record<
    string,
    (args: Record<string, unknown>) => Promise<AccountManagementToolResult>
  > = {
    list_orgs: () => describeOrganizations(client),
    switch_org: async (a) => {
      const requested =
        typeof a.organization === 'string' ? a.organization.trim() : '';
      if (!requested) {
        throw new Error(
          'organization is required: a name, slug or id from list_orgs.',
        );
      }
      if (!(await client.canSwitchOrganizations())) {
        throw new Error(
          'This connection was approved without organization switching. Reconnect and tick "Switch between my organizations" on the consent screen.',
        );
      }
      const organization = matchOrganization(
        await client.listOrganizations(),
        requested,
      );
      await client.switchOrganization(organization.id);
      return describeOrganizations(client, 'Switched organization.');
    },
    get_job_status: async (a) => {
      const status = await client.getJobStatus(a.jobId as string);
      const artifact = await toNativeMcpMediaResult(
        status,
        mediaOrigins,
        logger,
      );
      const statusText =
        artifact.content[0]?.type === 'text'
          ? artifact.content[0].text
          : formatToolData(status);
      return {
        content: [
          {
            text: `Job Status:\n\n${statusText}`,
            type: 'text' as const,
          },
          ...artifact.content.slice(1),
        ],
        structuredContent: artifact.structuredContent,
      };
    },
  };

  const handler = handlers[name];
  if (!handler) throw new Error(`Unknown account management tool: ${name}`);
  return handler(args);
}
