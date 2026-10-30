import assert from 'node:assert/strict';
import test from 'node:test';
import { cardResourceUri, smokeMcp } from './mcp-smoke.mjs';

const MCP = 'https://mcp.example.test/mcp';
const AUTH = 'https://api.example.test';
const CARD = 'ui://genfeed/content-cards-v5-abcdef123456.html';

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', ...init.headers },
    status: init.status ?? 200,
  });
}

function server(overrides = {}) {
  return async (url, init = {}) => {
    const request = init.body ? JSON.parse(init.body) : {};
    if (String(url).endsWith('/.well-known/oauth-authorization-server'))
      return json({
        authorization_response_iss_parameter_supported: true,
        client_id_metadata_document_supported: true,
        ...overrides.metadata,
      });
    if (init.method === 'OPTIONS')
      return new Response(null, {
        headers: {
          'access-control-allow-headers':
            overrides.allowHeaders ??
            'Authorization, Content-Type, Mcp-Method, Mcp-Name',
        },
        status: 204,
      });
    if (request.method === 'initialize')
      return json(
        {},
        {
          headers: { 'www-authenticate': 'Bearer resource_metadata="x"' },
          status: 401,
        },
      );
    if (request.method === 'resources/read')
      return json({
        result: { contents: [{ text: '<html>', uri: request.params.uri }] },
      });
    return json({
      result: { tools: [{ _meta: { ui: { resourceUri: CARD } }, name: 'a' }] },
      ...overrides.list,
    });
  };
}

test('passes when modern, legacy, CORS and OAuth surfaces are healthy', async () => {
  const passed = await smokeMcp({
    authUrl: AUTH,
    fetchImpl: server(),
    mcpUrl: MCP,
  });
  assert.equal(passed.length, 6);
});

test('finds the card resource linked from a tool', () => {
  assert.equal(
    cardResourceUri([{ name: 'x' }, { _meta: { ui: { resourceUri: CARD } } }]),
    CARD,
  );
  assert.equal(cardResourceUri([{ name: 'x' }]), undefined);
});

test('fails when tools/list returns no tools', async () => {
  await assert.rejects(
    smokeMcp({
      authUrl: AUTH,
      fetchImpl: server({ list: { result: { tools: [] } } }),
      mcpUrl: MCP,
    }),
    /returned no tools/,
  );
});

test('fails when CORS drops Mcp-Name', async () => {
  await assert.rejects(
    smokeMcp({
      authUrl: AUTH,
      fetchImpl: server({ allowHeaders: 'Content-Type, Mcp-Method' }),
      mcpUrl: MCP,
    }),
    /Mcp-Method and Mcp-Name/,
  );
});

test('fails when OAuth metadata loses CIMD support', async () => {
  await assert.rejects(
    smokeMcp({
      authUrl: AUTH,
      fetchImpl: server({
        metadata: { client_id_metadata_document_supported: false },
      }),
      mcpUrl: MCP,
    }),
    /CIMD/,
  );
});
