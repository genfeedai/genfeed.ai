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
    // Floor re-baselined 2026-07-06: the REST audit (#1354/#1380 family,
    // merged today) deliberately deleted/collapsed dozens of RPC-style and
    // duplicate routes, taking the committed artifact from >900 paths down
    // to ~897. This assertion exists to catch *accidental* truncation (a
    // whole controller or module silently dropped from the Swagger scan),
    // not to pin an exact count — so the floor sits comfortably below the
    // post-audit count with headroom for further deliberate consolidation,
    // while still being high enough that losing a real controller's worth
    // of routes would trip it.
    expect(Object.keys(document.paths).length).toBeGreaterThan(850);
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
