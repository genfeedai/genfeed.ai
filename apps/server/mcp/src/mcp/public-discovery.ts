import { isPublicMcpResourceUri } from '@mcp/mcp/resource-catalog';

/**
 * Methods a caller may send without a bearer token. `initialize` is
 * deliberately excluded: an MCP client decides whether a server needs
 * authorization from the response to `initialize` (MCP authorization spec,
 * "servers MUST return 401"). Answering it tokenless let Cursor and Grok Bot
 * mark Genfeed connected with ~119 tools while every tool call failed, and
 * skipped the OAuth flow entirely until the first `tools/call` (#4950).
 * Registries and scanners still get the catalog from `tools/list` and the
 * public server card.
 */
const PUBLIC_DISCOVERY_METHODS = new Set([
  'ping',
  'resources/list',
  'tools/list',
]);

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

function isJsonRpcRequest(body: unknown): body is JsonRpcRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return false;
  }

  const record = body as Record<string, unknown>;
  return record.jsonrpc === '2.0' && typeof record.method === 'string';
}

/**
 * Authentication is optional only for metadata that helps an agent decide how
 * to connect. Tool calls and tenant-scoped resources still require a bearer
 * credential at the HTTP boundary.
 */
export function isPublicMcpRequest(body: unknown): boolean {
  if (!isJsonRpcRequest(body)) {
    return false;
  }

  if (PUBLIC_DISCOVERY_METHODS.has(body.method)) {
    return true;
  }

  if (body.method !== 'resources/read' || !body.params) {
    return false;
  }

  if (typeof body.params !== 'object' || Array.isArray(body.params)) {
    return false;
  }

  return isPublicMcpResourceUri((body.params as Record<string, unknown>).uri);
}
