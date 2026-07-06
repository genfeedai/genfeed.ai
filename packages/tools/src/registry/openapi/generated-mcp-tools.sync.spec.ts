import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GENERATED_MCP_OPERATIONS } from '../generated/mcp-operations.generated.js';
import { GENERATED_MCP_TOOLS } from '../generated/mcp-tools.generated.js';
import { ALL_TOOLS, getToolsForSurface } from '../tool-registry.js';
import {
  buildGeneratedMcpOperationBindings,
  buildGeneratedMcpTools,
} from './build-generated-mcp-tools.js';
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

function loadToolsFromSpec() {
  const document = JSON.parse(
    readFileSync(SPEC_PATH, 'utf8'),
  ) as IOpenApiDocument;
  const allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8')) as {
    internalRoutes: { pathPrefix: string }[];
  };
  const prefixes = allowlist.internalRoutes.map((route) => route.pathPrefix);
  return buildGeneratedMcpTools(document, prefixes);
}

function loadOperationsFromSpec() {
  const document = JSON.parse(
    readFileSync(SPEC_PATH, 'utf8'),
  ) as IOpenApiDocument;
  const allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8')) as {
    internalRoutes: { pathPrefix: string }[];
  };
  const prefixes = allowlist.internalRoutes.map((route) => route.pathPrefix);
  return buildGeneratedMcpOperationBindings(document, prefixes);
}

describe('committed generated MCP tools artifact', () => {
  it('matches a fresh build from the OpenAPI spec (no drift, deterministic)', () => {
    expect(GENERATED_MCP_TOOLS).toEqual(loadToolsFromSpec());
  });

  it('rebuilding twice from the spec is structurally identical', () => {
    expect(loadToolsFromSpec()).toEqual(loadToolsFromSpec());
  });

  it('covers the bulk of the API surface (parity baseline)', () => {
    // ~1000 non-internal operations at time of writing; assert a healthy floor
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

describe('committed generated MCP operation bindings artifact', () => {
  it('matches a fresh build from the OpenAPI spec (no drift, deterministic)', () => {
    expect(GENERATED_MCP_OPERATIONS).toEqual(loadOperationsFromSpec());
  });

  it('has one operation binding per generated tool', () => {
    const toolNames = GENERATED_MCP_TOOLS.map((tool) => tool.name).sort();
    const operationNames = GENERATED_MCP_OPERATIONS.map(
      (operation) => operation.toolName,
    ).sort();
    expect(operationNames).toEqual(toolNames);
  });

  it('preserves method, path, and argument-location metadata', () => {
    const update = GENERATED_MCP_OPERATIONS.find(
      (operation) => operation.toolName === 'activities__update',
    );

    expect(update).toMatchObject({
      bodyFields: expect.arrayContaining(['isRead']),
      bodyStyle: 'properties',
      method: 'patch',
      path: '/activities/{activityId}',
      pathParams: ['activityId'],
    });
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
