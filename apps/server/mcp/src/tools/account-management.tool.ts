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
      const brands = await client.listBrands();
      const brandList = Array.isArray(brands) ? brands : brands ? [brands] : [];
      const requestedId =
        typeof a.brandId === 'string' && a.brandId.trim().length > 0
          ? a.brandId.trim()
          : undefined;
      if (requestedId) {
        const brand = brandList.find(
          (entry) =>
            entry &&
            typeof entry === 'object' &&
            'id' in entry &&
            String((entry as { id?: unknown }).id) === requestedId,
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
