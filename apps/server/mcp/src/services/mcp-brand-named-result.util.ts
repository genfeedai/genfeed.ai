import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ClientService } from '@mcp/services/client.service';
import {
  collectBrandIds,
  withBrandNames,
} from '@mcp/services/mcp-brand-names.util';
import { listCallerBrands } from '@mcp/services/mcp-caller-brands.util';

/** Results that already list brands by name, so they need no extra lookup. */
const BRAND_NAMED_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  'get_account',
  'get_brands',
]);

/**
 * Adds the brand name next to every `brandId` in a result (#7138). A failed
 * lookup leaves the result as the tool returned it.
 */
export async function nameBrands(
  result: AgentToolResult,
  name: string,
  client: Pick<ClientService, 'executeAgentTool'>,
  logger: Pick<LoggerService, 'warn'>,
): Promise<AgentToolResult> {
  if (!result.success || BRAND_NAMED_TOOL_NAMES.has(name)) return result;
  const ids = collectBrandIds(result.data);
  if (ids.length === 0) return result;
  try {
    const brands = await listCallerBrands(client);
    const names = new Map(
      (brands ?? [])
        .filter((brand) => ids.includes(brand.id) && brand.label !== brand.id)
        .map((brand) => [brand.id, brand.label]),
    );
    return { ...result, data: withBrandNames(result.data, names) };
  } catch (error: unknown) {
    logger.warn('Could not name brands in a tool result', error);
    return result;
  }
}
