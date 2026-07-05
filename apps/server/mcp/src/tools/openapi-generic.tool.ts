import { getGeneratedRoute } from '@genfeedai/tools';
import type { ClientService } from '@mcp/services/client.service';

/**
 * Generic dispatch handler for OpenAPI-generated MCP tools (#1249 parity epic).
 *
 * Looks up the tool's {@link GeneratedRoute} manifest entry and executes it
 * through {@link ClientService.executeGeneratedOperation} — no per-endpoint
 * handler is written for these tools. Returns the raw unwrapped API data; the
 * caller is responsible for wrapping it into the MCP result shape.
 */
export async function handleOpenApiGenericTool(
  clientService: ClientService,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const route = getGeneratedRoute(name);
  if (!route) {
    throw new Error(`Unknown generated tool: ${name}`);
  }

  return clientService.executeGeneratedOperation(route, args);
}
