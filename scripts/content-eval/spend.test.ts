import { describe, expect, it } from 'vitest';
import type { CallProvenance } from './contracts';
import {
  catalogueCostUsd,
  reservationCostUsd,
  SpendCapExceededError,
  SpendLedger,
  upperBoundTokens,
  usdToCredits,
} from './spend';

function provenance(costUsd: number, credits: number): CallProvenance {
  return {
    callId: 'call-1-judge',
    capabilityProfileVersion: null,
    completionTokens: 10,
    compilerVersion: null,
    costEvidence: 'reported',
    costUsd,
    credits,
    family: 'anthropic',
    isFailed: false,
    kind: 'judge',
    latencyMs: 5,
    model: 'anthropic/claude-sonnet-5',
    modelVersion: 'anthropic/claude-sonnet-5',
    promptDigest: `sha256:${'0'.repeat(64)}`,
    promptTokens: 10,
    provider: 'stub',
    rowId: 'row-1',
    rubricDigest: null,
    rubricVersion: null,
    seed: 1,
    settings: { maxTokens: 10, temperature: 0 },
  };
}

describe('SpendLedger', () => {
  it('refuses a non-positive cap', () => {
    expect(() => new SpendLedger(0)).toThrow('--max-credits');
  });

  it('refuses a reservation that would cross the cap', () => {
    const ledger = new SpendLedger(1);
    expect(() => ledger.reserve(0.5)).not.toThrow();
    expect(() => ledger.reserve(1.5)).toThrow(SpendCapExceededError);
  });

  it('records the call, then throws once a charge crosses the cap', () => {
    const ledger = new SpendLedger(1);
    ledger.charge({
      credits: 0.6,
      kind: 'judge',
      provenance: provenance(0.006, 0.6),
    });

    expect(() =>
      ledger.charge({
        credits: 0.6,
        kind: 'generation',
        provenance: provenance(0.006, 0.6),
      }),
    ).toThrow(SpendCapExceededError);
    // The overrunning call is still on the books for the partial report.
    expect(ledger.calls).toHaveLength(2);
    expect(ledger.summary()).toMatchObject({
      byKind: { generation: 0.6, judge: 0.6 },
      callCount: 2,
      maxCredits: 1,
    });
    expect(ledger.summary().spentCredits).toBeCloseTo(1.2);
  });
});

describe('pricing', () => {
  it('converts USD to credits at $0.01 per credit', () => {
    expect(usdToCredits(0.25)).toBeCloseTo(25);
  });

  it('prices exact catalogue keys and nothing else', () => {
    expect(
      catalogueCostUsd('google/gemini-2.5-flash-lite', 1_000_000, 0),
    ).toBeGreaterThan(0);
    expect(catalogueCostUsd('unknown/model', 1000, 1000)).toBeNull();
    // A router settles from the provider's reported cost, never the catalogue.
    expect(catalogueCostUsd('openrouter/auto', 1000, 1000)).toBeNull();
  });

  it('reserves the repair retry as well as the first attempt', () => {
    const single = catalogueCostUsd('google/gemini-2.5-flash-lite', 1000, 1000);
    const reserved = reservationCostUsd(
      'google/gemini-2.5-flash-lite',
      1000,
      1000,
    );

    expect(single).not.toBeNull();
    // Two prompts, the rejected answer echoed back, and two completions.
    expect(reserved).toBeCloseTo(
      catalogueCostUsd('google/gemini-2.5-flash-lite', 3000, 2000) ?? 0,
    );
  });

  it('bounds prompt tokens by UTF-8 bytes, so non-Latin text is not undercounted', () => {
    expect(upperBoundTokens('abcd')).toBe(4);
    expect(upperBoundTokens('日本語')).toBe(9);
  });

  it('reserves an unpriced model at the priciest catalogue rate', () => {
    const unknown = reservationCostUsd('unknown/model', 1000, 1000);
    const cheap = reservationCostUsd(
      'google/gemini-2.5-flash-lite',
      1000,
      1000,
    );

    expect(unknown).toBeGreaterThan(cheap);
  });
});
