import { isPublicMcpRequest } from '@mcp/mcp/public-discovery';
import { McpResourceUri } from '@mcp/mcp/resource-catalog';

describe('isPublicMcpRequest', () => {
  it.each(['ping', 'tools/list', 'resources/list'])(
    'allows unauthenticated MCP discovery method %s',
    (method) => {
      expect(isPublicMcpRequest({ jsonrpc: '2.0', method })).toBe(true);
    },
  );

  it.each(['initialize', 'notifications/initialized'])(
    'requires a bearer token for %s so clients start OAuth on connect (#4950)',
    (method) => {
      expect(isPublicMcpRequest({ jsonrpc: '2.0', method })).toBe(false);
    },
  );

  it('allows reading only the public agent guide', () => {
    expect(
      isPublicMcpRequest({
        jsonrpc: '2.0',
        method: 'resources/read',
        params: { uri: McpResourceUri.AGENT_GUIDE },
      }),
    ).toBe(true);
    expect(
      isPublicMcpRequest({
        jsonrpc: '2.0',
        method: 'resources/read',
        params: { uri: McpResourceUri.VIDEO_ANALYTICS },
      }),
    ).toBe(false);
  });

  it.each([
    { jsonrpc: '2.0', method: 'tools/call', params: { name: 'create_post' } },
    { jsonrpc: '2.0', method: 'resources/subscribe' },
    { method: 'resources/list' },
    null,
  ])('keeps protected or malformed requests behind authentication', (body) => {
    expect(isPublicMcpRequest(body)).toBe(false);
  });
});
