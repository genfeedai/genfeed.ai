import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { McpResourceUri } from '@mcp/mcp/resource-catalog';
import type { ClientService } from '@mcp/services/client.service';
import { isBrandContextUri } from '@mcp/services/mcp-brand-context-resource.util';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';
import { describe, expect, it } from 'vitest';

type Call = {
  context?: Record<string, unknown>;
  name: string;
  parameters: Record<string, unknown>;
};

interface BrandRow {
  id: string;
  name: string;
}

/**
 * An in-memory stand-in for the API's agent-tools endpoint. It authorizes the
 * way the real one does: a revoked credential is refused on every call, and a
 * brand outside the credential's access is refused when named in the scope.
 */
function createApi(options: { accessibleBrands: BrandRow[] }) {
  const state = { isRevoked: false };
  const calls: Call[] = [];
  const knowledge = new Map<string, Record<string, unknown>[]>([
    [
      'brand-1',
      [
        {
          id: 'src-1',
          kind: 'document',
          observedAt: '2026-10-20T10:00:00.000Z',
          purpose: 'voice',
          retrievalState: 'ready',
          title: 'Brand voice guide',
          version: 3,
          versionId: 'ver-3',
        },
        { kind: 'document', title: 'Row without an id is not citable' },
      ],
    ],
  ]);

  const client = {
    executeAgentTool: async (
      name: string,
      parameters: Record<string, unknown>,
      context?: Record<string, unknown>,
    ): Promise<AgentToolResult> => {
      calls.push({ context, name, parameters });
      if (state.isRevoked) {
        throw new Error('Unauthorized');
      }
      const scopedBrandId = context?.brandId;
      if (
        typeof scopedBrandId === 'string' &&
        !options.accessibleBrands.some((brand) => brand.id === scopedBrandId)
      ) {
        throw new Error('Forbidden');
      }
      switch (name) {
        case 'get_brands':
          return {
            creditsUsed: 0,
            data: {
              brands: options.accessibleBrands.map((brand) => ({
                id: brand.id,
                label: brand.name,
              })),
            },
            success: true,
          };
        case 'get_brand_context':
          return {
            creditsUsed: 0,
            data: {
              brandId: scopedBrandId,
              name: options.accessibleBrands.find(
                (brand) => brand.id === scopedBrandId,
              )?.name,
              voice: { tone: 'plainspoken' },
            },
            success: true,
          };
        case 'get_context_coverage':
          return {
            creditsUsed: 0,
            data: {
              families: [{ family: 'voice', state: 'covered' }],
              usage: parameters.usage,
            },
            success: true,
          };
        case 'get_knowledge_sources': {
          const sources = knowledge.get(String(scopedBrandId)) ?? [];
          return {
            creditsUsed: 0,
            data: { sources, total: sources.length },
            success: true,
          };
        }
        default:
          return { creditsUsed: 0, error: `Unknown ${name}`, success: false };
      }
    },
    setBearerToken: () => undefined,
  };

  return { calls, client, state };
}

function createRegistry(
  client: ReturnType<typeof createApi>['client'],
  accessMode: 'claude' | 'standard' = 'standard',
) {
  const logger = {
    debug: () => undefined,
    error: () => undefined,
    log: () => undefined,
    warn: () => undefined,
  } as unknown as LoggerService;
  return new ToolRegistryService(
    client as unknown as ClientService,
    logger,
    'user',
    [],
    undefined,
    accessMode,
  );
}

interface ResourceBody {
  brand?: { brandId?: string; name?: string };
  brandId?: string;
  brands?: { id: string; label: string }[];
  citations?: { sourceId: string; title?: string; version?: number }[];
  coverage?: { families: unknown[] };
  sections?: Record<string, string>;
  status?: string;
}

async function read(registry: ToolRegistryService, uri: string) {
  const result = (await registry.handleResourceRead({ uri })) as {
    contents: { mimeType: string; text: string; uri: string }[];
  };
  expect(result.contents).toHaveLength(1);
  expect(result.contents[0].mimeType).toBe('application/json');
  return JSON.parse(result.contents[0].text) as ResourceBody;
}

const BRAND_ONE = { id: 'brand-1', name: 'Acme' };
const BRAND_TWO = { id: 'brand-2', name: 'Acme Labs' };
const URI = McpResourceUri.BRAND_CONTEXT;

describe('brand-context MCP resource', () => {
  it('matches only its own uri and the brandId query', () => {
    expect(isBrandContextUri(URI)).toBe(true);
    expect(isBrandContextUri(`${URI}?brandId=brand-1`)).toBe(true);
    expect(isBrandContextUri(`${URI}?brandId=a&brandId=b`)).toBe(true);
    expect(isBrandContextUri(`${URI}?other=1`)).toBe(false);
    expect(isBrandContextUri('genfeed://brands/context/extra')).toBe(false);
    expect(isBrandContextUri('genfeed://brands')).toBe(false);
    expect(isBrandContextUri('https://brands/context')).toBe(false);
    expect(isBrandContextUri('not a uri')).toBe(false);
    expect(isBrandContextUri(undefined)).toBe(false);
  });

  it('reads the only brand the credential can access, with citations', async () => {
    const api = createApi({ accessibleBrands: [BRAND_ONE] });
    const body = await read(createRegistry(api.client), URI);

    expect(body).toMatchObject({
      brand: { name: 'Acme' },
      brandId: 'brand-1',
      coverage: { families: [{ family: 'voice', state: 'covered' }] },
      sections: { brandContext: 'ok', coverage: 'ok', sources: 'ok' },
    });
    // A row without an id cannot be cited, so it is not listed as a citation.
    expect(body.citations).toEqual([
      {
        kind: 'document',
        observedAt: '2026-10-20T10:00:00.000Z',
        purpose: 'voice',
        retrievalState: 'ready',
        sourceId: 'src-1',
        title: 'Brand voice guide',
        version: 3,
        versionId: 'ver-3',
      },
    ]);
  });

  it('scopes every tool call to the brand it resolved', async () => {
    const api = createApi({ accessibleBrands: [BRAND_ONE, BRAND_TWO] });
    await read(createRegistry(api.client), `${URI}?brandId=brand-2`);

    const scoped = api.calls.filter((call) => call.name !== 'get_brands');
    expect(scoped.map((call) => call.name)).toEqual([
      'get_brand_context',
      'get_context_coverage',
      'get_knowledge_sources',
    ]);
    for (const call of scoped) {
      expect(call.context).toEqual({ brandId: 'brand-2' });
    }
  });

  it('asks an account with several brands to choose instead of guessing', async () => {
    const api = createApi({ accessibleBrands: [BRAND_ONE, BRAND_TWO] });
    const body = await read(createRegistry(api.client), URI);

    expect(body).toMatchObject({
      brands: [
        { id: 'brand-1', label: 'Acme' },
        { id: 'brand-2', label: 'Acme Labs' },
      ],
      status: 'brand_required',
    });
    expect(api.calls.map((call) => call.name)).toEqual(['get_brands']);
  });

  it('refuses a brand the credential cannot access', async () => {
    const api = createApi({ accessibleBrands: [BRAND_ONE] });
    await expect(
      read(createRegistry(api.client), `${URI}?brandId=foreign-brand`),
    ).rejects.toThrow('Forbidden');
    // The refusal came before any content was read.
    expect(api.calls.map((call) => call.name)).toEqual(['get_brand_context']);
  });

  it('says so when the account has no brand', async () => {
    const api = createApi({ accessibleBrands: [] });
    await expect(read(createRegistry(api.client), URI)).rejects.toThrow(
      'no brand',
    );
  });

  it('denies a revoked credential on the very next read', async () => {
    const api = createApi({ accessibleBrands: [BRAND_ONE] });
    const registry = createRegistry(api.client);

    await expect(read(registry, URI)).resolves.toMatchObject({
      brandId: 'brand-1',
    });

    api.state.isRevoked = true;
    await expect(read(registry, URI)).rejects.toThrow('Unauthorized');
    await expect(read(registry, `${URI}?brandId=brand-1`)).rejects.toThrow(
      'Unauthorized',
    );
  });

  it('keeps no copy of a brand between reads', async () => {
    const api = createApi({ accessibleBrands: [BRAND_ONE] });
    const registry = createRegistry(api.client);
    await read(registry, `${URI}?brandId=brand-1`);
    const firstReadCalls = api.calls.length;

    await read(registry, `${URI}?brandId=brand-1`);
    expect(api.calls).toHaveLength(firstReadCalls * 2);
  });

  it('reads only the reviewed brand tool for a Claude connector', async () => {
    const api = createApi({ accessibleBrands: [BRAND_ONE] });
    const body = await read(createRegistry(api.client, 'claude'), URI);

    expect(body.sections).toEqual({
      brandContext: 'ok',
      coverage: 'not_permitted',
      sources: 'not_permitted',
    });
    expect(body.citations).toEqual([]);
    expect(body.coverage).toBeUndefined();
    expect(
      api.calls.filter((call) => call.name !== 'get_brands').map((c) => c.name),
    ).toEqual(['get_brand_context']);
  });
});
