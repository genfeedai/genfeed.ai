import { describe, expect, it } from 'vitest';
import { loadQaCards, loadSmokeRows, resolveTextRow } from './cards';
import { type QaCapture, qaCaptureSchema } from './contracts';
import { evaluateCapture } from './evaluate';
import { renderQaSummary, summarizeQaResults } from './summary';

const cards = loadQaCards();
const smokeRows = loadSmokeRows();
const socialCard = cards.find((card) => card.id === 'qa-text-social-post');
const imageCard = cards.find((card) => card.id === 'qa-image-brand-kit');
if (!socialCard || !imageCard) throw new Error('starter cards are missing');
const socialRow = resolveTextRow(socialCard, smokeRows);

function capture(overrides: Record<string, unknown>): QaCapture {
  return qaCaptureSchema.parse({
    assetId: 'asset-1',
    capturedAt: '2026-11-13T12:00:00.000Z',
    cardId: 'qa-text-social-post',
    creditsCharged: 2,
    model: { model: 'm', provider: 'p', version: null },
    outcome: 'generated',
    output:
      'A cast-iron skillet that goes from hob to oven. Shop the KELDER skillet today.',
    receipt: {
      brandOs: 'approved',
      brandOsRevisionId: 'rev-1',
      receiptId: 'rcpt-1',
    },
    releaseSha: 'f84ac9f2',
    runId: 'run-1',
    runner: 'grok-bot',
    ...overrides,
  });
}

describe('evaluateCapture', () => {
  it('passes a text capture with an approved receipt and clean text', () => {
    const result = evaluateCapture(socialCard, capture({}), socialRow);
    expect(result.status).toBe('pass');
    expect(result.contextChecks.map((check) => check.id)).toEqual([
      'context-receipt',
      'context-brand-os-approved',
    ]);
    expect(result.isJudged).toBe(false);
  });

  it('calls a missing receipt context-missing, not a quality failure', () => {
    const result = evaluateCapture(
      socialCard,
      capture({ receipt: null }),
      socialRow,
    );
    expect(result.status).toBe('context-missing');
  });

  it('calls a receipt without an approved brand revision context-missing', () => {
    const result = evaluateCapture(
      socialCard,
      capture({ receipt: { brandOs: 'none', receiptId: 'rcpt-2' } }),
      socialRow,
    );
    expect(result.status).toBe('context-missing');
    expect(
      result.contextChecks.find((c) => c.id === 'context-brand-os-approved')
        ?.passed,
    ).toBe(false);
  });

  it('fails text that uses a banned phrase', () => {
    const result = evaluateCapture(
      socialCard,
      capture({ output: 'A game-changer for your kitchen.' }),
      socialRow,
    );
    expect(result.status).toBe('fail');
    expect(
      result.deterministicChecks?.find((c) => c.id === 'banned-phrases')
        ?.passed,
    ).toBe(false);
  });

  it('records a blocked run as blocked with no checks', () => {
    const result = evaluateCapture(
      socialCard,
      capture({
        assetId: null,
        blockedReason: 'eval org out of credits',
        outcome: 'blocked',
        output: null,
        receipt: null,
      }),
      socialRow,
    );
    expect(result.status).toBe('blocked');
    expect(result.contextChecks).toEqual([]);
  });

  it('passes an image capture on context proof alone and reports no text checks', () => {
    const result = evaluateCapture(
      imageCard,
      capture({ cardId: 'qa-image-brand-kit', output: null }),
      null,
    );
    expect(result.status).toBe('pass');
    expect(result.deterministicChecks).toBeNull();
  });

  it('refuses a capture for a different card', () => {
    expect(() => evaluateCapture(imageCard, capture({}), null)).toThrow(
      'Capture is for qa-text-social-post, not qa-image-brand-kit',
    );
  });
});

describe('capture schema', () => {
  it('rejects an approved receipt without a revision id', () => {
    expect(() =>
      capture({ receipt: { brandOs: 'approved', receiptId: 'r' } }),
    ).toThrow('brandOsRevisionId');
  });

  it('rejects a blocked capture without a reason', () => {
    expect(() => capture({ outcome: 'blocked', output: null })).toThrow(
      'blockedReason',
    );
  });
});

describe('summarizeQaResults', () => {
  it('counts statuses and context proof per kind and sums credits', () => {
    const results = [
      evaluateCapture(socialCard, capture({ runId: 'a' }), socialRow),
      evaluateCapture(
        socialCard,
        capture({ receipt: null, runId: 'b' }),
        socialRow,
      ),
      evaluateCapture(
        imageCard,
        capture({ cardId: 'qa-image-brand-kit', output: null, runId: 'c' }),
        null,
      ),
    ];
    const summary = summarizeQaResults(results);
    expect(summary.isFailed).toBe(true);
    expect(summary.totalCredits).toBe(6);
    expect(summary.kinds).toEqual([
      {
        contentKind: 'brand-kit-fidelity',
        contextProofRate: 1,
        credits: 2,
        medium: 'image',
        runs: 1,
        statuses: { blocked: 0, 'context-missing': 0, fail: 0, pass: 1 },
      },
      {
        contentKind: 'social-post',
        contextProofRate: 0.5,
        credits: 4,
        medium: 'text',
        runs: 2,
        statuses: { blocked: 0, 'context-missing': 1, fail: 0, pass: 1 },
      },
    ]);
    expect(renderQaSummary(summary)).toContain(
      '| text | social-post | 2 | 1 | 0 | 1 | 0 | 50% | 4 |',
    );
  });
});
