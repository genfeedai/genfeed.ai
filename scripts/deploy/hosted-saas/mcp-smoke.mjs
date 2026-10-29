import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const MODERN_VERSION = '2026-07-28';
const LEGACY_VERSION = '2025-11-25';
const ORIGIN = 'https://claude.ai';

// Fetches only public, unauthenticated discovery surfaces: no token, no tool call.
async function readBody(response) {
  const text = await response.text();
  const data = response.headers
    .get('content-type')
    ?.includes('text/event-stream')
    ? text
        .split('\n')
        .find((line) => line.startsWith('data: '))
        ?.slice(6)
    : text;
  try {
    return JSON.parse(data ?? '');
  } catch {
    return undefined;
  }
}

function modernBody(method, params = {}) {
  return {
    id: 1,
    jsonrpc: '2.0',
    method,
    params: {
      ...params,
      _meta: {
        'io.modelcontextprotocol/protocolVersion': MODERN_VERSION,
        'io.modelcontextprotocol/clientInfo': {
          name: 'deploy-smoke',
          version: '1',
        },
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    },
  };
}

function post(fetchImpl, mcpUrl, body, headers) {
  return fetchImpl(mcpUrl, {
    body: JSON.stringify(body),
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      ...headers,
    },
    method: 'POST',
  });
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

export function cardResourceUri(tools) {
  for (const tool of tools) {
    const uri = tool?._meta?.ui?.resourceUri;
    if (typeof uri === 'string' && uri.startsWith('ui://')) return uri;
  }
  return undefined;
}

const REQUEST_TIMEOUT_MS = 20_000;

function boundedFetch(url, init) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

/** Runs every check once and returns the labels of the ones that passed. */
export async function smokeMcp({ mcpUrl, authUrl, fetchImpl = boundedFetch }) {
  const passed = [];
  const pass = (label) => passed.push(label);

  const list = await post(fetchImpl, mcpUrl, modernBody('tools/list'), {
    'MCP-Protocol-Version': MODERN_VERSION,
    'Mcp-Method': 'tools/list',
  });
  const listing = await readBody(list);
  expect(list.status === 200, `modern tools/list returned HTTP ${list.status}`);
  const tools = listing?.result?.tools;
  expect(
    Array.isArray(tools) && tools.length > 0,
    'modern tools/list returned no tools',
  );
  pass(`modern tools/list (${tools.length} tools)`);

  const uri = cardResourceUri(tools);
  expect(uri, 'no tool links a card resource through _meta.ui.resourceUri');
  const read = await post(
    fetchImpl,
    mcpUrl,
    modernBody('resources/read', { uri }),
    {
      'MCP-Protocol-Version': MODERN_VERSION,
      'Mcp-Method': 'resources/read',
      'Mcp-Name': uri,
    },
  );
  const card = await readBody(read);
  expect(
    read.status === 200,
    `card resources/read returned HTTP ${read.status}`,
  );
  expect(
    card?.result?.contents?.[0]?.uri === uri &&
      typeof card.result.contents[0].text === 'string',
    'card resources/read did not return the card document',
  );
  pass('unauthenticated card resources/read');

  const legacy = await post(
    fetchImpl,
    mcpUrl,
    { id: 1, jsonrpc: '2.0', method: 'tools/list' },
    { 'MCP-Protocol-Version': LEGACY_VERSION },
  );
  const legacyListing = await readBody(legacy);
  expect(
    legacy.status === 200,
    `legacy tools/list returned HTTP ${legacy.status}`,
  );
  expect(
    Array.isArray(legacyListing?.result?.tools) &&
      legacyListing.result.tools.length > 0,
    'legacy tools/list returned no tools',
  );
  pass(`legacy ${LEGACY_VERSION} tools/list`);

  const initialize = await post(
    fetchImpl,
    mcpUrl,
    {
      id: 1,
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        capabilities: {},
        clientInfo: { name: 'deploy-smoke', version: '1' },
        protocolVersion: LEGACY_VERSION,
      },
    },
    {},
  );
  await initialize.text();
  expect(
    initialize.status === 401 &&
      /resource_metadata=/.test(
        initialize.headers.get('www-authenticate') ?? '',
      ),
    'legacy initialize without a token must answer 401 with resource_metadata',
  );
  pass('legacy initialize starts OAuth discovery');

  const preflight = await fetchImpl(mcpUrl, {
    headers: {
      'Access-Control-Request-Headers':
        'content-type,mcp-method,mcp-name,mcp-protocol-version',
      'Access-Control-Request-Method': 'POST',
      Origin: ORIGIN,
    },
    method: 'OPTIONS',
  });
  const allowed = (preflight.headers.get('access-control-allow-headers') ?? '')
    .toLowerCase()
    .split(',')
    .map((header) => header.trim());
  expect(
    ['mcp-method', 'mcp-name'].every((header) => allowed.includes(header)),
    'CORS preflight must allow Mcp-Method and Mcp-Name',
  );
  pass('CORS allows Mcp-Method and Mcp-Name');

  const metadata = await fetchImpl(
    `${authUrl}/.well-known/oauth-authorization-server`,
  );
  const server = await readBody(metadata);
  expect(
    metadata.status === 200,
    `OAuth metadata returned HTTP ${metadata.status}`,
  );
  expect(
    server?.client_id_metadata_document_supported === true,
    'OAuth metadata must advertise CIMD support',
  );
  expect(
    server?.authorization_response_iss_parameter_supported === true,
    'OAuth metadata must advertise RFC 9207 iss',
  );
  pass('OAuth metadata advertises CIMD and iss');

  return passed;
}

export async function smokeMcpWithRetry({
  attempts,
  delaySeconds,
  log = console.log,
  ...options
}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await smokeMcp(options);
    } catch (error) {
      if (attempt >= attempts) throw error;
      log(`MCP smoke attempt ${attempt}/${attempts} failed: ${error.message}`);
      await sleep(delaySeconds * 1000);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { values } = parseArgs({
    options: {
      'auth-url': { type: 'string' },
      attempts: { default: '7', type: 'string' },
      'delay-seconds': { default: '10', type: 'string' },
      'mcp-url': { type: 'string' },
    },
  });
  if (!values['mcp-url'] || !values['auth-url']) {
    console.error('Usage: mcp-smoke.mjs --mcp-url <url> --auth-url <url>');
    process.exit(5);
  }
  try {
    const passed = await smokeMcpWithRetry({
      attempts: Number(values.attempts),
      authUrl: values['auth-url'],
      delaySeconds: Number(values['delay-seconds']),
      mcpUrl: values['mcp-url'],
    });
    for (const label of passed) console.log(`- ${label}`);
  } catch (error) {
    console.error(`::error::MCP smoke failed: ${error.message}`);
    process.exit(1);
  }
}
