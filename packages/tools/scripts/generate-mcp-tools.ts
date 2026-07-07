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
import {
  buildGeneratedMcpOperationBindings,
  buildGeneratedMcpTools,
  type IGeneratedMcpOperationBinding,
} from '../src/registry/openapi/build-generated-mcp-tools.js';
import type { IOpenApiDocument } from '../src/registry/openapi/openapi-types.js';

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
const OPERATIONS_OUT_PATH = resolve(
  packageDir,
  'src/registry/generated/mcp-operations.generated.ts',
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

function renderToolsArtifact(tools: CanonicalToolDefinition[]): string {
  const literal = JSON.stringify(sortKeysDeep(tools), null, 2);
  return `${[
    '// AUTO-GENERATED — DO NOT EDIT BY HAND.',
    '//',
    '// Source of truth: apps/server/api/openapi/openapi.json (Phase 1 / #1247).',
    '// Regenerate:      bun run --filter=@genfeedai/tools generate:mcp-tools',
    '//',
    `// ${tools.length} MCP tools, one per non-internal OpenAPI operation (#1248).`,
    '// Execution metadata lives in mcp-operations.generated.ts (#1249 / #1250).',
    '',
    "import type { CanonicalToolDefinition } from '../../interfaces/tool-definition.interface.js';",
    '',
    `export const GENERATED_MCP_TOOLS: CanonicalToolDefinition[] = ${literal};`,
    '',
  ].join('\n')}`;
}

function renderOperationsArtifact(
  operations: IGeneratedMcpOperationBinding[],
): string {
  const literal = JSON.stringify(sortKeysDeep(operations), null, 2);
  return `${[
    '// AUTO-GENERATED — DO NOT EDIT BY HAND.',
    '//',
    '// Source of truth: apps/server/api/openapi/openapi.json (Phase 1 / #1247).',
    '// Regenerate:      bun run --filter=@genfeedai/tools generate:mcp-tools',
    '//',
    `// ${operations.length} MCP operation bindings for generated-tool dispatch (#1249 / #1250).`,
    '',
    "import type { IGeneratedMcpOperationBinding } from '../openapi/build-generated-mcp-tools.js';",
    '',
    `export const GENERATED_MCP_OPERATIONS: IGeneratedMcpOperationBinding[] = ${literal};`,
    '',
  ].join('\n')}`;
}

function loadSpec(): {
  document: IOpenApiDocument;
  internalPrefixes: string[];
} {
  const document = JSON.parse(
    readFileSync(SPEC_PATH, 'utf8'),
  ) as IOpenApiDocument;
  const allowlist = JSON.parse(
    readFileSync(ALLOWLIST_PATH, 'utf8'),
  ) as IInternalRouteAllowlist;
  const internalPrefixes = allowlist.internalRoutes.map(
    (route) => route.pathPrefix,
  );
  return { document, internalPrefixes };
}

function main(): void {
  const isCheck = process.argv.slice(2).includes('--check');
  const { document, internalPrefixes } = loadSpec();
  const tools = buildGeneratedMcpTools(document, internalPrefixes);
  const operations = buildGeneratedMcpOperationBindings(
    document,
    internalPrefixes,
  );
  const toolsContents = renderToolsArtifact(tools);
  const operationsContents = renderOperationsArtifact(operations);

  if (isCheck) {
    const currentTools = readFileSync(OUT_PATH, 'utf8');
    const currentOperations = readFileSync(OPERATIONS_OUT_PATH, 'utf8');
    if (
      currentTools !== toolsContents ||
      currentOperations !== operationsContents
    ) {
      console.error(
        'Generated MCP tool artifacts are stale. Run: bun run --filter=@genfeedai/tools generate:mcp-tools',
      );
      process.exit(1);
    }
    console.info(
      `Generated MCP tool artifacts are up to date (${tools.length} tools).`,
    );
    return;
  }

  writeFileSync(OUT_PATH, toolsContents);
  writeFileSync(OPERATIONS_OUT_PATH, operationsContents);
  console.info(
    `Wrote ${tools.length} generated MCP tools to ${OUT_PATH.replace(`${repoRoot}/`, '')}`,
  );
  console.info(
    `Wrote ${operations.length} generated MCP operation bindings to ${OPERATIONS_OUT_PATH.replace(`${repoRoot}/`, '')}`,
  );
}

main();
