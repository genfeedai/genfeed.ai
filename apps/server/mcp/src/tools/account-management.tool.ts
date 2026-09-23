import type {
  AgentToolResult,
  McpMediaToolResult,
} from '@genfeedai/contracts/interfaces';
import { toMcpMediaToolResult } from '@genfeedai/helpers';
import type { ClientService } from '@mcp/services/client.service';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readAgentBrands(result: AgentToolResult): Record<string, unknown>[] {
  if (!result.success) {
    const message =
      typeof result.error === 'string' && result.error.trim().length > 0
        ? result.error
        : 'Failed to list brands';
    throw new Error(message);
  }
  const data = result.data;
  if (!isRecord(data) || !Array.isArray(data.brands)) {
    return [];
  }
  return data.brands.filter(isRecord);
}

function brandMatches(
  brand: Record<string, unknown>,
  requested: string,
): boolean {
  const needle = requested.trim().toLowerCase();
  for (const key of ['id', 'slug', 'name', 'label'] as const) {
    const value = brand[key];
    if (typeof value === 'string' && value.trim().toLowerCase() === needle) {
      return true;
    }
  }
  return false;
}

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
    get_account_info: async () => {
      const info = await client.getAccountInfo();
      return {
        content: [
          {
            text: `Account Info:\n\n${JSON.stringify(info, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    get_brand: async (a) => {
      // Same organization-scoped list as `list_brands`. The HTTP `/brands`
      // collection also includes brands the user owns in other organizations,
      // which hid the active org brand and rejected its id.
      const brandList = readAgentBrands(
        await client.executeAgentTool('list_brands', {}),
      );
      const requestedId =
        typeof a.brandId === 'string' && a.brandId.trim().length > 0
          ? a.brandId.trim()
          : undefined;
      if (requestedId) {
        const brand = brandList.find((entry) =>
          brandMatches(entry, requestedId),
        );
        return {
          content: [
            {
              text: brand
                ? `Selected Brand:\n\n${JSON.stringify(brand, null, 2)}`
                : 'Brand was not found in this organization.',
              type: 'text' as const,
            },
          ],
        };
      }
      if (brandList.length > 1) {
        return {
          content: [
            {
              text:
                'Select a brand before continuing. Pass brandId from list_brands; the first organization brand is not used automatically.\n\n' +
                JSON.stringify(brandList, null, 2),
              type: 'text' as const,
            },
          ],
        };
      }
      const brand = brandList[0];
      return {
        content: [
          {
            text: brand
              ? `Active Brand:\n\n${JSON.stringify(brand, null, 2)}`
              : 'No active brand found.',
            type: 'text' as const,
          },
        ],
      };
    },
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
    list_brands: async () => {
      const brands = await client.listBrands();
      const brandList = Array.isArray(brands) ? brands : [];
      return {
        content: [
          {
            text:
              brandList.length > 0
                ? `Found ${brandList.length} brands:\n\n${JSON.stringify(brandList, null, 2)}`
                : 'No brands found.',
            type: 'text' as const,
          },
        ],
      };
    },
  };

  const handler = handlers[name];
  if (!handler) throw new Error(`Unknown account management tool: ${name}`);
  return handler(args);
}
