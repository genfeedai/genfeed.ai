/**
 * CLI runner: generate MCP tool definitions from the API OpenAPI document
 * (#1248, parity epic #1246).
 *
 * Reads the committed, byte-stable spec at
 * `apps/server/api/openapi/openapi.json` (produced by `bun run openapi:emit`)
 * and writes `src/generated/openapi-tools.generated.ts` deterministically:
 *   - `GENERATED_MCP_TOOLS`: `SourceTool[]`, one per non-internal operation.
 *   - `GENERATED_TOOL_ROUTES`: the dispatcher's arg→request binding manifest.
 *
 * All transform logic lives in `src/generated/openapi-tool-builder.ts` (pure,
 * unit-tested); this file is only spec IO + serialization. Re-run:
 * `bun run gen:openapi-tools` from `packages/tools`.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type InternalRouteCandidate,
  isInternalRoute,
} from '../src/generated/internal-routes.allowlist.ts';
import {
  type BuiltOperation,
  buildOperation,
  HTTP_METHODS,
  type JsonSchema,
  type OpenApiOperation,
} from '../src/generated/openapi-tool-builder.ts';
import type { GeneratedRoute } from '../src/interfaces/generated-route.interface.ts';
import type { SourceTool } from '../src/interfaces/source-tool.interface.ts';

interface OpenApiDocument {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, JsonSchema> };
}

function generate(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const specPath = resolve(
    here,
    '../../../apps/server/api/openapi/openapi.json',
  );
  if (!existsSync(specPath)) {
    throw new Error(
      `OpenAPI spec not found at ${specPath}. Run \`bun run openapi:emit\` in apps/server/api first.`,
    );
  }

  const doc = JSON.parse(readFileSync(specPath, 'utf8')) as OpenApiDocument;
  const schemas = doc.components?.schemas ?? {};

  const built: BuiltOperation[] = [];
  const seenNames = new Map<string, string>(); // name → operationId
  let internalCount = 0;
  let missingOperationId = 0;

  for (const [path, methods] of Object.entries(doc.paths)) {
    for (const method of HTTP_METHODS) {
      const op = methods[method];
      if (!op) continue;
      if (!op.operationId) {
        missingOperationId += 1;
        continue;
      }

      const candidate: InternalRouteCandidate = {
        method,
        path,
        tags: op.tags ?? [],
      };
      if (isInternalRoute(candidate)) {
        internalCount += 1;
        continue;
      }

      const result = buildOperation(path, method, op, schemas);
      const clash = seenNames.get(result.tool.name);
      if (clash) {
        throw new Error(
          `Generated tool-name collision: "${result.tool.name}" from both ` +
            `"${clash}" and "${result.route.operationId}". Adjust deriveToolName().`,
        );
      }
      seenNames.set(result.tool.name, result.route.operationId);
      built.push(result);
    }
  }

  built.sort((a, b) => a.tool.name.localeCompare(b.tool.name));

  const tools: SourceTool[] = built.map((b) => b.tool);
  const manifest: Record<string, GeneratedRoute> = {};
  for (const b of built) manifest[b.tool.name] = b.route;

  const header = `/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 *
 * Regenerate with \`bun run gen:openapi-tools\` (packages/tools). Source of
 * truth: apps/server/api/openapi/openapi.json (#1246 API↔MCP parity).
 *
 * ${tools.length} operations exposed. ${internalCount} internal routes excluded
 * via src/generated/internal-routes.allowlist.ts.
 */
import type { GeneratedRouteManifest } from '../interfaces/generated-route.interface.js';
import type { SourceTool } from '../interfaces/source-tool.interface.js';

export const GENERATED_MCP_TOOLS: SourceTool[] = ${JSON.stringify(tools, null, 2)};

export const GENERATED_TOOL_ROUTES: GeneratedRouteManifest = ${JSON.stringify(
    manifest,
    null,
    2,
  )};
`;

  const outPath = resolve(here, '../src/generated/openapi-tools.generated.ts');
  writeFileSync(outPath, header, 'utf8');

  process.stdout.write(
    `Generated ${tools.length} MCP tools (${internalCount} internal excluded, ` +
      `${missingOperationId} without operationId) → ${outPath}\n`,
  );
}

generate();
