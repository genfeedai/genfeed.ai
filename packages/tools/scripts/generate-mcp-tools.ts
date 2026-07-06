/**
 * Build-time MCP tool generator (#1248).
 *
 * Reads the committed OpenAPI artifact (Phase 1 / #1247) and the internal-route
 * allowlist, turns every non-internal operation into a canonical MCP tool
 * definition, and writes the committed, typed artifact consumed by the tools
 * registry. Deterministic: the output is a canonically key-sorted JSON literal,
 * so regenerating without a spec change produces byte-identical output.
 *
 * Usage:
 *   bun run --filter=@genfeedai/tools generate:mcp-tools
 *   bun run scripts/generate-mcp-tools.ts --check   # fail if the artifact is stale
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import type { CanonicalToolDefinition } from '../src/interfaces/tool-definition.interface.js';
import { buildGeneratedMcpTools } from '../src/registry/openapi/build-generated-mcp-tools.js';
import type {
  IOpenApiDocument,
  IOpenApiSchema,
} from '../src/registry/openapi/openapi-types.js';

interface IInternalRouteAllowlist {
  internalRoutes: { pathPrefix: string; reason: string }[];
}

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptsDir, '..');
const repoRoot = resolve(packageDir, '..', '..');

const SPEC_PATH = resolve(repoRoot, 'apps/server/api/openapi/openapi.json');
const ALLOWLIST_PATH = resolve(
  repoRoot,
  'apps/server/api/src/config/openapi-internal-routes.json',
);
const OUT_PATH = resolve(
  packageDir,
  'src/registry/generated/mcp-tools.generated.ts',
);

/**
 * Recursively sorts object keys so the emitted literal is byte-stable
 * regardless of insertion order. Arrays are order-significant (JSON Schema
 * `required`/`enum`, our sorted properties) and are left untouched.
 */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeysDeep(item));
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortKeysDeep(record[key]);
    }
    return sorted;
  }
  return value;
}

function renderArtifact(tools: CanonicalToolDefinition[]): string {
  const literal = JSON.stringify(sortKeysDeep(tools), null, 2);
  return `${[
    '// AUTO-GENERATED — DO NOT EDIT BY HAND.',
    '//',
    '// Source of truth: apps/server/api/openapi/openapi.json (Phase 1 / #1247).',
    '// Regenerate:      bun run --filter=@genfeedai/tools generate:mcp-tools',
    '//',
    `// ${tools.length} MCP tools, one per non-internal OpenAPI operation (#1248).`,
    '// Dispatch/execution and approval-gating are intentionally not wired here',
    '// (that is #1249 / #1250); these definitions only populate the mcp surface.',
    '',
    "import type { CanonicalToolDefinition } from '../../interfaces/tool-definition.interface.js';",
    '',
    `export const GENERATED_MCP_TOOLS: CanonicalToolDefinition[] = ${literal};`,
    '',
  ].join('\n')}`;
}

function loadSpec(): {
  document: IOpenApiDocument;
  internalPrefixes: string[];
} {
  const document = JSON.parse(readFileSync(SPEC_PATH, 'utf8')) as {
    paths?: Record<string, Record<string, unknown>>;
    components?: { schemas?: Record<string, IOpenApiSchema> };
  };
  const allowlist = JSON.parse(
    readFileSync(ALLOWLIST_PATH, 'utf8'),
  ) as IInternalRouteAllowlist;
  const internalPrefixes = allowlist.internalRoutes.map(
    (route) => route.pathPrefix,
  );
  return { document: document as IOpenApiDocument, internalPrefixes };
}

function main(): void {
  const isCheck = process.argv.slice(2).includes('--check');
  const { document, internalPrefixes } = loadSpec();
  const tools = buildGeneratedMcpTools(document, internalPrefixes);
  const contents = renderArtifact(tools);

  if (isCheck) {
    const current = readFileSync(OUT_PATH, 'utf8');
    if (current !== contents) {
      console.error(
        'Generated MCP tools artifact is stale. Run: bun run --filter=@genfeedai/tools generate:mcp-tools',
      );
      process.exit(1);
    }
    console.info(
      `Generated MCP tools artifact is up to date (${tools.length} tools).`,
    );
    return;
  }

  writeFileSync(OUT_PATH, contents);
  console.info(
    `Wrote ${tools.length} generated MCP tools to ${OUT_PATH.replace(`${repoRoot}/`, '')}`,
  );
}

main();
