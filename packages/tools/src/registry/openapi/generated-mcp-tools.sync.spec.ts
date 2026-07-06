import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GENERATED_MCP_TOOLS } from '../generated/mcp-tools.generated.js';
import { ALL_TOOLS, getToolsForSurface } from '../tool-registry.js';
import { buildGeneratedMcpTools } from './build-generated-mcp-tools.js';
import type { IOpenApiDocument } from './openapi-types.js';

/**
 * Guards that the committed generated artifact is a deterministic function of
 * the Phase 1 OpenAPI document + the internal-route allowlist — the same thing
 * the generator script produces. A drift here means the artifact is stale;
 * regenerate with `bun run --filter=@genfeedai/tools generate:mcp-tools`.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../../..');
const SPEC_PATH = resolve(REPO_ROOT, 'apps/server/api/openapi/openapi.json');
const ALLOWLIST_PATH = resolve(
  REPO_ROOT,
  'apps/server/api/src/config/openapi-internal-routes.json',
);

function loadFromSpec() {
  const document = JSON.parse(
    readFileSync(SPEC_PATH, 'utf8'),
  ) as IOpenApiDocument;
  const allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8')) as {
    internalRoutes: { pathPrefix: string }[];
  };
  const prefixes = allowlist.internalRoutes.map((route) => route.pathPrefix);
  return buildGeneratedMcpTools(document, prefixes);
}

describe('committed generated MCP tools artifact', () => {
  it('matches a fresh build from the OpenAPI spec (no drift, deterministic)', () => {
    expect(GENERATED_MCP_TOOLS).toEqual(loadFromSpec());
  });

  it('rebuilding twice from the spec is structurally identical', () => {
    expect(loadFromSpec()).toEqual(loadFromSpec());
  });

  it('covers the bulk of the API surface (parity baseline)', () => {
    // ~1101 non-internal operations at time of writing; assert a healthy floor
    // so an accidental empty/partial regen fails loudly.
    expect(GENERATED_MCP_TOOLS.length).toBeGreaterThan(1000);
  });

  it('every generated tool is a namespaced, unique, mcp-only definition', () => {
    const names = GENERATED_MCP_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of GENERATED_MCP_TOOLS) {
      expect(tool.name).toContain('__');
      expect(tool.name).toMatch(/^[a-z0-9_]+$/);
      expect(tool.surfaces.mcp).toBe(true);
      expect(tool.surfaces.agent).toBe(false);
      expect(tool.parameters.type).toBe('object');
    }
  });
});

describe('registry integration', () => {
  it('exposes generated tools on the mcp surface', () => {
    const mcpNames = new Set(
      getToolsForSurface('mcp').map((tool) => tool.name),
    );
    for (const tool of GENERATED_MCP_TOOLS) {
      expect(mcpNames.has(tool.name)).toBe(true);
    }
  });

  it('reserves the `__` namespace for generated tools only', () => {
    // The MCP dispatcher classifies generated tools by the `__` marker, so no
    // hand-authored tool may use it.
    const generatedNames = new Set(
      GENERATED_MCP_TOOLS.map((tool) => tool.name),
    );
    const doubleUnderscore = ALL_TOOLS.filter((tool) =>
      tool.name.includes('__'),
    );
    for (const tool of doubleUnderscore) {
      expect(generatedNames.has(tool.name)).toBe(true);
    }
  });
});
