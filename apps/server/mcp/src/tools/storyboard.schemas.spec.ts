import { storyboardToolSchemas } from '@mcp/tools/storyboard.schemas';
import { describe, expect, it } from 'vitest';

describe('Canonical Storyboard MCP boundary', () => {
  it('requires the same intent UUID and source constraints as HTTP creation', () => {
    const input = {
      brandId: 'brand-1',
      clientRequestId: 'd160833e-d602-4617-a21b-721eb9aa7da8',
      source: { kind: 'uploaded_video', assetId: 'video-1' },
    };
    expect(
      storyboardToolSchemas.storyboard_run_create.safeParse(input).success,
    ).toBe(true);
    expect(
      storyboardToolSchemas.storyboard_run_create.safeParse({
        ...input,
        clientRequestId: undefined,
      }).success,
    ).toBe(false);
    expect(
      storyboardToolSchemas.storyboard_run_create.safeParse({
        ...input,
        price: 0,
      }).success,
    ).toBe(false);
  });
  it('binds every mutable operation to brand, run and expected revision', () => {
    for (const name of [
      'storyboard_plan_reset',
      'storyboard_plan_approve',
      'storyboard_run_cancel',
      'storyboard_run_resume',
    ] as const) {
      expect(
        storyboardToolSchemas[name].safeParse({
          brandId: 'brand-1',
          runId: 'run-1',
          expectedRevision: 1,
        }).success,
      ).toBe(true);
      expect(
        storyboardToolSchemas[name].safeParse({
          runId: 'run-1',
          expectedRevision: 1,
        }).success,
      ).toBe(false);
    }
  });
  it('quotes reject ambiguous stages and execute requires an accepted quote identity', () => {
    expect(
      storyboardToolSchemas.storyboard_run_quote.safeParse({
        brandId: 'brand-1',
        runId: 'run-1',
        expectedRevision: 1,
        operation: 'repair',
        shotId: 'shot-1',
      }).success,
    ).toBe(false);
    expect(
      storyboardToolSchemas.storyboard_run_execute.safeParse({
        brandId: 'brand-1',
        runId: 'run-1',
        expectedRevision: 1,
      }).success,
    ).toBe(false);
    expect(
      storyboardToolSchemas.storyboard_run_execute.safeParse({
        brandId: 'brand-1',
        runId: 'run-1',
        expectedRevision: 1,
        quoteId: 'quote-1',
      }).success,
    ).toBe(true);
  });
});
