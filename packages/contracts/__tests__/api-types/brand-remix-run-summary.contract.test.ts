import { describe, expect, test } from 'vitest';
import {
  brandRemixRunListQuerySchema,
  brandRemixRunSummarySchema,
} from '../../src/api-types/contracts/brand-remix-run-summary.contract';

const summary = {
  brandId: 'brand-1',
  createdAt: '2026-09-01T10:00:00.000Z',
  id: 'run-1',
  outputKind: 'video',
  phase: 'partially_ready',
  runtimeSeconds: 18,
  scenePipelineState: 'partial_failure',
  shotCount: 3,
  sourceKind: 'remix_discovery',
  title: 'Proof-led hook',
  updatedAt: '2026-09-02T10:00:00.000Z',
} as const;

describe('brand remix run summary contract', () => {
  test('accepts a storyboard runs list row', () => {
    expect(brandRemixRunSummarySchema.parse(summary)).toEqual(summary);
  });

  test('allows a run without shots or a scene pipeline', () => {
    const parsed = brandRemixRunSummarySchema.parse({
      ...summary,
      outputKind: 'copy',
      runtimeSeconds: null,
      scenePipelineState: undefined,
      shotCount: 0,
    });

    expect(parsed.runtimeSeconds).toBeNull();
    expect(parsed.shotCount).toBe(0);
  });

  test('rejects unknown source kinds and extra fields', () => {
    expect(
      brandRemixRunSummarySchema.safeParse({ ...summary, sourceKind: 'remix' })
        .success,
    ).toBe(false);
    expect(
      brandRemixRunSummarySchema.safeParse({ ...summary, config: {} }).success,
    ).toBe(false);
  });

  test('defaults and bounds list pagination', () => {
    expect(brandRemixRunListQuerySchema.parse({})).toEqual({
      limit: 50,
      page: 1,
    });
    expect(
      brandRemixRunListQuerySchema.parse({ limit: '20', page: '3' }),
    ).toEqual({ limit: 20, page: 3 });
    expect(brandRemixRunListQuerySchema.safeParse({ limit: 500 }).success).toBe(
      false,
    );
    expect(brandRemixRunListQuerySchema.safeParse({ page: 0 }).success).toBe(
      false,
    );
  });
});
