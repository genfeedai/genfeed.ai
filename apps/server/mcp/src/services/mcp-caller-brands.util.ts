import type { McpBrandOption } from '@genfeedai/actions';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import type { ClientService } from '@mcp/services/client.service';

/** The caller's brands, or `undefined` when they could not be loaded. */
export async function listCallerBrands(
  client: Pick<ClientService, 'executeAgentTool'>,
): Promise<McpBrandOption[] | undefined> {
  const result = await client.executeAgentTool('get_brands', {});
  const brands = isRecord(result.data) ? result.data.brands : undefined;
  if (!result.success || !Array.isArray(brands)) return undefined;
  return brands.flatMap((brand): McpBrandOption[] => {
    if (!isRecord(brand) || typeof brand.id !== 'string') return [];
    const label =
      typeof brand.label === 'string' && brand.label.trim()
        ? brand.label
        : typeof brand.name === 'string' && brand.name.trim()
          ? brand.name
          : brand.id;
    return [{ id: brand.id, label }];
  });
}
