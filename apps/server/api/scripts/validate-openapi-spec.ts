/**
 * Validates the committed OpenAPI artifact (#1247) without booting the API:
 *  - every operation carries a unique operationId
 *  - the file is in canonical form (sorted keys, 2-space indent, trailing
 *    newline) — i.e. exactly what the emit gate produces
 *  - every internal-route allowlist entry still matches a real operation
 *
 * Usage:
 *   bun run scripts/validate-openapi-spec.ts
 *   bun run scripts/validate-openapi-spec.ts --spec=/tmp/openapi.json
 */

import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import type { OpenAPIObject } from '@nestjs/swagger';
import { serializeOpenApiDocument } from '../src/helpers/utils/openapi/openapi-document.util';
import { validateOpenApiSpec } from '../src/helpers/utils/openapi/openapi-spec-validation.util';
import type { IOpenApiInternalRouteAllowlist } from '../src/shared/interfaces/openapi/openapi-spec.interface';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(scriptsDir, '..');

const DEFAULT_SPEC_PATH = join(apiDir, 'openapi', 'openapi.json');
const ALLOWLIST_PATH = join(
  apiDir,
  'src',
  'config',
  'openapi-internal-routes.json',
);

function parseSpecPath(): string {
  const specArg = process.argv
    .slice(2)
    .find((arg) => arg.startsWith('--spec='))
    ?.split('=')[1];

  if (!specArg) {
    return DEFAULT_SPEC_PATH;
  }

  return isAbsolute(specArg) ? specArg : resolve(process.cwd(), specArg);
}

function main(): void {
  const specPath = parseSpecPath();
  const rawSpec = readFileSync(specPath, 'utf8');
  const document = JSON.parse(rawSpec) as OpenAPIObject;
  const allowlist = JSON.parse(
    readFileSync(ALLOWLIST_PATH, 'utf8'),
  ) as IOpenApiInternalRouteAllowlist;

  const { stats, violations } = validateOpenApiSpec(
    document as unknown as Record<string, unknown>,
    allowlist,
  );

  if (serializeOpenApiDocument(document) !== rawSpec) {
    violations.push(
      `${specPath} is not in canonical form — regenerate it with: bun run --filter=@genfeedai/api openapi:emit`,
    );
  }

  if (violations.length > 0) {
    console.error(`OpenAPI spec validation failed (${violations.length}):`);
    for (const violation of violations) {
      console.error(`  - ${violation}`);
    }
    process.exit(1);
  }

  console.info(
    `OpenAPI spec valid: ${stats.totalOperations} operations, ${stats.uniqueOperationIds} unique operationIds, ${stats.internalOperations} internal, ${stats.parityOperations} parity-relevant`,
  );
}

main();
