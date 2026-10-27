import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { McpResourceUri } from '@mcp/mcp/resource-catalog';
import { jsonResource } from '@mcp/services/mcp-resource-contents.util';

export interface BrandContextResourceBrand {
  id: string;
  label: string;
}

export interface BrandContextResourceDeps {
  /** True when this credential may call the tool (claude mode narrows it). */
  isToolAllowed: (toolName: string) => boolean;
  /** Runs an agent tool with the caller's bearer token, scoped to a brand. */
  executeTool: (
    toolName: string,
    parameters: Record<string, unknown>,
    context?: Record<string, unknown>,
  ) => Promise<AgentToolResult>;
  /** The caller's brands, or undefined when they could not be loaded. */
  listBrands: () => Promise<BrandContextResourceBrand[] | undefined>;
}

type SectionState = 'ok' | 'unavailable' | 'not_permitted';

const SOURCE_LIMIT = 50;

const BRAND_CONTEXT_PATH = new URL(McpResourceUri.BRAND_CONTEXT);

/** Whether `uri` is the brand-context resource, with or without `?brandId=`. */
export function isBrandContextUri(uri: unknown): uri is string {
  if (typeof uri !== 'string') return false;
  try {
    const parsed = new URL(uri);
    return (
      parsed.protocol === BRAND_CONTEXT_PATH.protocol &&
      parsed.host === BRAND_CONTEXT_PATH.host &&
      parsed.pathname === BRAND_CONTEXT_PATH.pathname &&
      [...parsed.searchParams.keys()].every((key) => key === 'brandId')
    );
  } catch {
    return false;
  }
}

function requestedBrandId(uri: string): string | undefined {
  return new URL(uri).searchParams.get('brandId')?.trim() || undefined;
}

function dataOf(result: AgentToolResult): Record<string, unknown> | undefined {
  return isRecord(result.data) ? result.data : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/** What a client may cite: a stable id and the exact version that was read. */
function citationOf(source: unknown) {
  if (!isRecord(source)) return [];
  const sourceId = asString(source.id);
  if (!sourceId) return [];
  return [
    {
      kind: asString(source.kind),
      observedAt: asString(source.observedAt),
      purpose: asString(source.purpose),
      retrievalState: asString(source.retrievalState),
      sourceId,
      title: asString(source.title),
      version: typeof source.version === 'number' ? source.version : undefined,
      versionId: asString(source.versionId),
    },
  ];
}

async function resolveBrandId(
  uri: string,
  deps: BrandContextResourceDeps,
): Promise<
  { brandId: string } | { response: ReturnType<typeof jsonResource> }
> {
  const requested = requestedBrandId(uri);
  if (requested) return { brandId: requested };

  const brands = await deps.listBrands();
  if (!brands) {
    throw new Error(
      'Your brands could not be loaded. Retry, or read genfeed://brands/context?brandId=<id> with an id from get_brands.',
    );
  }
  if (brands.length === 0) {
    throw new Error(
      'You have no brand to read context for yet. Create a brand in Genfeed, then read this resource again.',
    );
  }
  if (brands.length === 1) return { brandId: brands[0].id };
  return {
    response: jsonResource(uri, {
      brands,
      message: `Choose a brand and read ${McpResourceUri.BRAND_CONTEXT}?brandId=<id>.`,
      status: 'brand_required',
    }),
  };
}

/**
 * Reads the brand-context resource (#7422): identity, voice and Knowledge
 * coverage for one brand, with the Knowledge sources a client can cite.
 *
 * The resource is a composition of the same agent tools the MCP tools call
 * (`get_brand_context`, `get_context_coverage`, `list_knowledge_sources`), run
 * with the caller's own bearer token and a `{ brandId }` scope the API
 * authorizes on every call. Nothing is cached here, so a revoked credential or
 * a brand the user lost access to is refused on the very next read; upstream
 * auth errors propagate instead of being turned into a partial answer.
 */
export async function readBrandContextResource(
  uri: string,
  deps: BrandContextResourceDeps,
) {
  const resolved = await resolveBrandId(uri, deps);
  if ('response' in resolved) return resolved.response;
  const { brandId } = resolved;
  const scope = { brandId };

  const brandContext = await deps.executeTool(
    'get_brand_context',
    { brandId },
    scope,
  );
  const brandContextData = dataOf(brandContext);
  if (!brandContext.success || !brandContextData) {
    throw new Error(brandContext.error ?? 'Brand context is not available.');
  }

  const sections: Record<string, SectionState> = {
    brandContext: 'ok',
    coverage: 'not_permitted',
    sources: 'not_permitted',
  };

  let coverage: Record<string, unknown> | undefined;
  if (deps.isToolAllowed('get_context_coverage')) {
    const result = await deps.executeTool(
      'get_context_coverage',
      { usage: 'context' },
      scope,
    );
    coverage = result.success ? dataOf(result) : undefined;
    sections.coverage = coverage ? 'ok' : 'unavailable';
  }

  let sources: unknown[] = [];
  let total: number | undefined;
  if (deps.isToolAllowed('list_knowledge_sources')) {
    const result = await deps.executeTool(
      'list_knowledge_sources',
      { limit: SOURCE_LIMIT },
      scope,
    );
    const data = result.success ? dataOf(result) : undefined;
    sections.sources = data ? 'ok' : 'unavailable';
    if (data && Array.isArray(data.sources)) {
      sources = data.sources;
      total = typeof data.total === 'number' ? data.total : undefined;
    }
  }

  const citations = sources.flatMap(citationOf);

  return jsonResource(uri, {
    brand: brandContextData,
    brandId,
    citations,
    coverage,
    knowledgeSourceTotal: total,
    readAt: new Date().toISOString(),
    sections,
  });
}
