import type { McpMediaToolResult } from '@genfeedai/contracts/interfaces';
import { toMcpMediaToolResult } from '@genfeedai/helpers';
import type { ClientService } from '@mcp/services/client.service';

type AccountManagementToolResult = {
  content: McpMediaToolResult['content'];
  structuredContent?: McpMediaToolResult['structuredContent'];
};

export function handleAccountManagementTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  const handlers: Record<
    string,
    (args: Record<string, unknown>) => Promise<AccountManagementToolResult>
  > = {
    get_job_status: async (a) => {
      const status = await client.getJobStatus(a.jobId as string);
      const artifact = toMcpMediaToolResult(status);
      const statusText =
        artifact.content[0]?.type === 'text'
          ? artifact.content[0].text
          : JSON.stringify(status, null, 2);
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
