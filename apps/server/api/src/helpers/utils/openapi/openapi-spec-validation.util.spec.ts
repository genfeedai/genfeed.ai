import type { IOpenApiInternalRouteAllowlist } from '@api/shared/interfaces/openapi/openapi-spec.interface';
import { describe, expect, it } from 'vitest';
import {
  collectOperations,
  isInternalRoute,
  validateOpenApiSpec,
} from './openapi-spec-validation.util';

const EMPTY_ALLOWLIST: IOpenApiInternalRouteAllowlist = {
  description: '',
  internalRoutes: [],
};

function buildDocument(
  paths: Record<string, Record<string, { operationId?: string }>>,
): Record<string, unknown> {
  return { info: { title: 'T', version: '1' }, openapi: '3.0.0', paths };
}

describe('collectOperations', () => {
  it('extracts every method/path pair with its operationId', () => {
    const document = buildDocument({
      '/v1/brands': {
        get: { operationId: 'BrandsController.findAll' },
        post: { operationId: 'BrandsController.create' },
      },
      '/v1/health': { get: { operationId: 'HealthController.check' } },
    });

    const operations = collectOperations(document);

    expect(operations).toHaveLength(3);
    expect(operations).toContainEqual({
      method: 'get',
      operationId: 'HealthController.check',
      path: '/v1/health',
    });
  });

  it('treats empty-string operationIds as missing', () => {
    const document = buildDocument({ '/v1/x': { get: { operationId: '' } } });
    expect(collectOperations(document)[0]?.operationId).toBeUndefined();
  });

  it('ignores non-operation path-item keys like parameters', () => {
    const document = {
      paths: {
        '/v1/x': {
          get: { operationId: 'XController.get' },
          parameters: [{ in: 'path', name: 'id' }],
        },
      },
    };
    expect(collectOperations(document)).toHaveLength(1);
  });
});

describe('isInternalRoute', () => {
  it('matches by path prefix', () => {
    const routes = [{ pathPrefix: '/v1/webhooks/', reason: 'inbound' }];
    expect(isInternalRoute('/v1/webhooks/stripe', routes)).toBe(true);
    expect(isInternalRoute('/v1/brands', routes)).toBe(false);
  });

  it('matches a non-slash prefix exactly or at a segment boundary', () => {
    const routes = [{ pathPrefix: '/health', reason: 'probes' }];
    expect(isInternalRoute('/health', routes)).toBe(true);
    expect(isInternalRoute('/health/live', routes)).toBe(true);
  });

  it('does NOT over-match a longer sibling segment', () => {
    const routes = [{ pathPrefix: '/health', reason: 'probes' }];
    // A future public route must not be silently excluded from parity.
    expect(isInternalRoute('/healthcare', routes)).toBe(false);
    expect(isInternalRoute('/health-check-public', routes)).toBe(false);
  });
});

describe('validateOpenApiSpec', () => {
  it('passes a valid document and reports stats', () => {
    const document = buildDocument({
      '/v1/brands': { get: { operationId: 'BrandsController.findAll' } },
      '/v1/health': { get: { operationId: 'HealthController.check' } },
    });
    const allowlist: IOpenApiInternalRouteAllowlist = {
      description: '',
      internalRoutes: [{ pathPrefix: '/v1/health', reason: 'probes' }],
    };

    const result = validateOpenApiSpec(document, allowlist);

    expect(result.violations).toEqual([]);
    expect(result.stats).toEqual({
      internalOperations: 1,
      parityOperations: 1,
      totalOperations: 2,
      uniqueOperationIds: 2,
    });
  });

  it('flags operations without operationId', () => {
    const document = buildDocument({ '/v1/x': { get: {} } });

    const { violations } = validateOpenApiSpec(document, EMPTY_ALLOWLIST);

    expect(violations).toEqual(['Missing operationId: GET /v1/x']);
  });

  it('flags duplicate operationIds across routes', () => {
    const document = buildDocument({
      '/v1/a': { get: { operationId: 'SameController.same' } },
      '/v1/b': { get: { operationId: 'SameController.same' } },
    });

    const { violations } = validateOpenApiSpec(document, EMPTY_ALLOWLIST);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(
      'Duplicate operationId "SameController.same"',
    );
    expect(violations[0]).toContain('GET /v1/a');
    expect(violations[0]).toContain('GET /v1/b');
  });

  it('flags allowlist entries that match no operation', () => {
    const document = buildDocument({
      '/v1/brands': { get: { operationId: 'BrandsController.findAll' } },
    });
    const allowlist: IOpenApiInternalRouteAllowlist = {
      description: '',
      internalRoutes: [{ pathPrefix: '/v1/removed', reason: 'gone' }],
    };

    const { violations } = validateOpenApiSpec(document, allowlist);

    expect(violations).toEqual([
      'Stale internal-route allowlist entry: "/v1/removed" matches no operation',
    ]);
  });
});
