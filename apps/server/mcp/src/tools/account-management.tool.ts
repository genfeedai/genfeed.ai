import type { ClientService } from '@mcp/services/client.service';

export function handleAccountManagementTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  const handlers: Record<
    string,
    (args: Record<string, unknown>) => Promise<{
      content: Array<{ text: string; type: 'text' }>;
    }>
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
    get_brand: async () => {
      const brands = await client.listBrands();
      const brand = Array.isArray(brands) ? brands[0] : brands;
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
      return {
        content: [
          {
            text: `Job Status:\n\n${JSON.stringify(status, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    list_brands: async (a) => {
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
