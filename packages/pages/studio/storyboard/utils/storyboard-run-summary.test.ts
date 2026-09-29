import type { BrandRemixRunSummary } from '@genfeedai/contracts/api-types/contracts';
import { describe, expect, it } from 'vitest';
import { isStoryboardRunNeedingAttention } from './storyboard-run-summary';

const summary: BrandRemixRunSummary = {
  brandId: 'brand-1',
  createdAt: '2026-09-01T10:00:00.000Z',
  id: 'run-1',
  outputKind: 'video',
  phase: 'prefilled',
  runtimeSeconds: 12,
  shotCount: 2,
  sourceKind: 'remix_discovery',
  title: 'Proof-led hook',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

describe('isStoryboardRunNeedingAttention', () => {
  it('flags failed runs and runs whose outputs wait for review', () => {
    expect(
      isStoryboardRunNeedingAttention({ ...summary, phase: 'failed' }),
    ).toBe(true);
    expect(
      isStoryboardRunNeedingAttention({
        ...summary,
        phase: 'ready_for_review',
      }),
    ).toBe(true);
  });

  it('flags a scene pipeline that stopped part-way or waits on a quote', () => {
    for (const scenePipelineState of [
      'partial_failure',
      'blocked',
      'quoted',
    ] as const) {
      expect(
        isStoryboardRunNeedingAttention({ ...summary, scenePipelineState }),
      ).toBe(true);
    }
  });

  it('leaves drafts, in-flight and finished runs alone', () => {
    expect(isStoryboardRunNeedingAttention(summary)).toBe(false);
    expect(
      isStoryboardRunNeedingAttention({
        ...summary,
        phase: 'generating',
        scenePipelineState: 'generating',
      }),
    ).toBe(false);
    expect(
      isStoryboardRunNeedingAttention({ ...summary, phase: 'approved' }),
    ).toBe(false);
  });
});
