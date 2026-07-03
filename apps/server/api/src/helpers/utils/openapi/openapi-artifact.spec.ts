import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IOpenApiInternalRouteAllowlist } from '@api/shared/interfaces/openapi/openapi-spec.interface';
import type { OpenAPIObject } from '@nestjs/swagger';
import { describe, expect, it } from 'vitest';
import { serializeOpenApiDocument } from './openapi-document.util';
import { validateOpenApiSpec } from './openapi-spec-validation.util';

/**
 * Guards the committed OpenAPI artifact (#1247): unique operationId on every
 * operation, canonical (deterministic) serialization, and a live allowlist.
 * Freshness against the current code is enforced by the openapi-drift CI job,
 * which regenerates the spec from the compiled bundle and diffs it.
 */

const specDir = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(specDir, '..', '..', '..', '..');
const ARTIFACT_PATH = join(apiRoot, 'openapi', 'openapi.json');
const ALLOWLIST_PATH = join(
  apiRoot,
  'src',
  'config',
  'openapi-internal-routes.json',
);

describe('committed OpenAPI artifact', () => {
  const rawSpec = readFileSync(ARTIFACT_PATH, 'utf8');
  const document = JSON.parse(rawSpec) as OpenAPIObject;
  const allowlist = JSON.parse(
    readFileSync(ALLOWLIST_PATH, 'utf8'),
  ) as IOpenApiInternalRouteAllowlist;

  it('covers the full API surface', () => {
    expect(Object.keys(document.paths).length).toBeGreaterThan(900);
  });

  it('has a unique operationId on every operation and a live allowlist', () => {
    const { stats, violations } = validateOpenApiSpec(
      document as unknown as Record<string, unknown>,
      allowlist,
    );

    expect(violations).toEqual([]);
    expect(stats.uniqueOperationIds).toBe(stats.totalOperations);
  });

  it('is stored in canonical deterministic form', () => {
    expect(serializeOpenApiDocument(document)).toBe(rawSpec);
  });

  it('pins the artifact info block (env-independent)', () => {
    expect(document.info.title).toBe('Genfeed.ai API');
    expect(document.info.version).toBe('1.0.0');
    expect(document.servers).toEqual([{ url: '/v1' }]);
  });
});
