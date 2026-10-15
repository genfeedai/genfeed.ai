import type { McpMediaToolResult } from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ClientService } from '@mcp/services/client.service';
import { toNativeMcpMediaResult } from '@mcp/services/mcp-media-result.util';
import { formatToolData } from '@mcp/shared/utils/tool-result-text.util';

type AccountManagementToolResult = {
  content: McpMediaToolResult['content'];
  structuredContent?: McpMediaToolResult['structuredContent'];
};

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
    list_orgs: async () => {
      const organizations = await client.listOrganizations();
      const active = organizations.find((org) => org.isActive);
      const readable = organizations.map(
        ({ isActive, isOwner, label, slug }) => ({
          isActive,
          isOwner,
          label,
          slug,
        }),
      );
      const guidance =
        organizations.length > 1
          ? `This connection works inside ${active ? `"${active.label}"` : 'one organization'}. To work in another, reconnect and choose it on the consent screen.\n\n`
          : '';
      return {
        content: [
          {
            text: `${guidance}${formatToolData({ organizations: readable })}`,
            type: 'text' as const,
          },
        ],
        structuredContent: {
          data: {
            ...(active ? { activeOrganizationId: active.id } : {}),
            organizations,
          },
        },
      };
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
