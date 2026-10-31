import type {
  McpMediaToolResult,
  OrganizationOption,
  OrganizationOptionBrand,
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

export function matchOrganization(
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
      ? `More than one organization matches "${requested}". Use its id from get_orgs.`
      : `No organization matches "${requested}". Run get_orgs to see yours.`,
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
  // An all-organizations connection chooses the organization and brand per
  // call, so it needs every organization's brands up front, not just the
  // active one's.
  const brandsByOrganization = new Map<string, OrganizationOptionBrand[]>(
    isSwitchable
      ? await Promise.all(
          organizations.map(
            async (org) =>
              [
                org.id,
                await bestEffort(
                  client.runInOrganization(org.id, () => client.listBrands()),
                  [],
                ),
              ] as const,
          ),
        )
      : [],
  );
  const readable = organizations.map(
    ({ id, isActive, isOwner, label, slug }) => ({
      ...(isSwitchable
        ? { brands: brandsByOrganization.get(id) ?? [], id }
        : {}),
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
        ? `This connection can use all of your organizations. It starts in ${workingIn}. To act in another organization for one call, pass its name, slug or id as "organization" on any tool (with that organization's brandId, listed under its brands in the structured result, for generation); switch_org changes the default instead.\n\n`
        : `This connection works inside ${workingIn}. To work in another, reconnect and choose it on the consent screen (choose "All my organizations" to use every one of them).\n\n`;
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
        organizations: isSwitchable
          ? organizations.map((org) => ({
              ...org,
              brands: brandsByOrganization.get(org.id) ?? [],
            }))
          : organizations,
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
    get_orgs: () => describeOrganizations(client),
    switch_org: async (a) => {
      const requested =
        typeof a.organization === 'string' ? a.organization.trim() : '';
      if (!requested) {
        throw new Error(
          'organization is required: a name, slug or id from get_orgs.',
        );
      }
      if (!(await client.canSwitchOrganizations())) {
        throw new Error(
          'This connection was limited to one organization. Reconnect and choose "All my organizations" on the consent screen.',
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
