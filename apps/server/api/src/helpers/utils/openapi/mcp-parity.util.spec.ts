import type {
  IMcpToolCoverageEntry,
  IOpenApiInternalRoute,
  IOpenApiOperationRef,
} from '@api/shared/interfaces/openapi/openapi-spec.interface';
import { describe, expect, it } from 'vitest';
import {
  computeMcpParityReport,
  findBaselineMetadataDrift,
} from './mcp-parity.util';

const INTERNAL_ROUTES: IOpenApiInternalRoute[] = [
  { pathPrefix: '/health', reason: 'probes' },
  { pathPrefix: '/webhooks/', reason: 'inbound webhooks' },
];

/**
 * Three real-shaped operations: one write, one read, one internal (health).
 */
const OPERATIONS: IOpenApiOperationRef[] = [
  {
    method: 'post',
    operationId: 'VideosController.generate',
    path: '/videos/generate',
  },
  { method: 'get', operationId: 'BrandsController.findAll', path: '/brands' },
  { method: 'get', operationId: 'HealthController.live', path: '/health/live' },
];

function report(params: {
  coverage?: IMcpToolCoverageEntry[];
  mcpToolNames?: string[];
  baseline?: string[];
  operations?: IOpenApiOperationRef[];
  internalRoutes?: IOpenApiInternalRoute[];
}) {
  return computeMcpParityReport({
    baselineOperationIds: new Set(params.baseline ?? []),
    coverage: params.coverage ?? [],
    internalRoutes: params.internalRoutes ?? INTERNAL_ROUTES,
    mcpToolNames: new Set(params.mcpToolNames ?? []),
    operations: params.operations ?? OPERATIONS,
  });
}

describe('computeMcpParityReport', () => {
  it('fails on a parity operation no tool reaches and no baseline entry', () => {
    const result = report({ coverage: [], baseline: [] });

    // Two parity ops (videos, brands); health is internal.
    expect(result.stats.parityOperations).toBe(2);
    expect(result.stats.coveredOperations).toBe(0);
    expect(result.stats.unexpectedOperations).toBe(2);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(
      result.unexpected.map((op: IOpenApiOperationRef) => op.operationId),
    ).toContain('VideosController.generate');
    // The message names the offending route.
    expect(result.violations.join('\n')).toContain('POST /videos/generate');
    expect(result.violations.join('\n')).toContain('no MCP tool covers');
  });

  it('passes when an operation is reachable via a coverage-map entry', () => {
    // One capability tool covers both parity operations.
    const result = report({
      mcpToolNames: ['studio'],
      coverage: [
        {
          operationIds: [
            'VideosController.generate',
            'BrandsController.findAll',
          ],
          tool: 'studio',
        },
      ],
      baseline: [],
    });

    expect(result.stats.coveredOperations).toBe(2);
    expect(result.stats.unexpectedOperations).toBe(0);
    expect(result.stats.staleBaselineEntries).toBe(0);
    expect(result.violations).toHaveLength(0);
  });

  it('flags a coverage-map entry naming a tool absent from the MCP surface', () => {
    const result = report({
      mcpToolNames: [], // 'studio' does not exist
      coverage: [
        { operationIds: ['VideosController.generate'], tool: 'studio' },
      ],
      baseline: ['BrandsController.findAll'],
    });

    // The videos op is not credited (phantom tool) AND the map entry is flagged.
    expect(result.stats.coveredOperations).toBe(0);
    expect(result.violations.join('\n')).toContain('unknown MCP tool "studio"');
  });

  it('flags a coverage-map entry referencing an unknown/internal operationId', () => {
    const result = report({
      mcpToolNames: ['studio'],
      coverage: [
        {
          operationIds: ['HealthController.live', 'GhostController.gone'],
          tool: 'studio',
        },
      ],
      baseline: ['VideosController.generate', 'BrandsController.findAll'],
    });

    // Neither operationId is a real parity op: both are rejected.
    const joined = result.violations.join('\n');
    expect(joined).toContain('HealthController.live');
    expect(joined).toContain('GhostController.gone');
  });

  it('passes when the uncovered operation is allowlisted as internal', () => {
    const result = report({
      coverage: [],
      baseline: [],
      internalRoutes: [
        ...INTERNAL_ROUTES,
        { pathPrefix: '/videos/', reason: 'internal for test' },
        { pathPrefix: '/brands', reason: 'internal for test' },
      ],
    });

    expect(result.stats.parityOperations).toBe(0);
    expect(result.stats.unexpectedOperations).toBe(0);
    expect(result.violations).toHaveLength(0);
  });

  it('passes when the uncovered operation is acknowledged in the baseline', () => {
    const result = report({
      coverage: [],
      baseline: ['VideosController.generate', 'BrandsController.findAll'],
    });

    expect(result.stats.uncoveredOperations).toBe(2);
    expect(result.stats.baselinedOperations).toBe(2);
    expect(result.stats.unexpectedOperations).toBe(0);
    expect(result.violations).toHaveLength(0);
  });

  it('still fails if only some uncovered operations are baselined', () => {
    const result = report({
      coverage: [],
      baseline: ['VideosController.generate'],
    });

    expect(result.stats.unexpectedOperations).toBe(1);
    expect(
      result.unexpected.map((op: IOpenApiOperationRef) => op.operationId),
    ).toEqual(['BrandsController.findAll']);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('fails on a stale baseline entry that is now covered (forces ratchet-down)', () => {
    const result = report({
      // videos is now reachable via a tool, but still sits in the baseline.
      mcpToolNames: ['studio'],
      coverage: [
        { operationIds: ['VideosController.generate'], tool: 'studio' },
      ],
      baseline: ['VideosController.generate', 'BrandsController.findAll'],
    });

    expect(result.stats.coveredOperations).toBe(1);
    expect(result.stats.staleBaselineEntries).toBe(1);
    expect(result.staleBaseline).toEqual(['VideosController.generate']);
    expect(result.violations.join('\n')).toContain('Stale parity-baseline');
  });

  it('fails on a stale baseline entry for an operation removed from the spec', () => {
    const result = report({
      coverage: [],
      baseline: ['GhostController.removed'],
    });

    expect(result.stats.staleBaselineEntries).toBe(1);
    expect(result.staleBaseline).toEqual(['GhostController.removed']);
  });

  it('fails defensively on a parity operation missing an operationId', () => {
    const result = report({
      operations: [{ method: 'get', path: '/no-id' }],
    });

    expect(result.violations.join('\n')).toContain('Missing operationId');
  });
});

describe('findBaselineMetadataDrift', () => {
  const uncovered: IOpenApiOperationRef[] = [
    {
      method: 'post',
      operationId: 'VideosController.generate',
      path: '/videos/generate',
    },
  ];

  it('reports no drift when ledger metadata matches the spec', () => {
    expect(findBaselineMetadataDrift(uncovered, uncovered)).toEqual([]);
  });

  it('flags a baselined op whose method/path moved under a stable operationId', () => {
    const baseline: IOpenApiOperationRef[] = [
      {
        method: 'get',
        operationId: 'VideosController.generate',
        path: '/videos/old-path',
      },
    ];

    const drift = findBaselineMetadataDrift(baseline, uncovered);

    expect(drift).toHaveLength(1);
    expect(drift[0]).toContain('VideosController.generate');
    expect(drift[0]).toContain('GET /videos/old-path');
    expect(drift[0]).toContain('POST /videos/generate');
  });

  it('ignores baseline entries no longer uncovered (handled by staleBaseline)', () => {
    const baseline: IOpenApiOperationRef[] = [
      { method: 'get', operationId: 'GhostController.gone', path: '/gone' },
    ];

    expect(findBaselineMetadataDrift(baseline, uncovered)).toEqual([]);
  });
});
