import { isPublicMcpResourceUri } from '@mcp/mcp/resource-catalog';

const PUBLIC_DISCOVERY_METHODS = new Set([
  'initialize',
  'notifications/initialized',
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
