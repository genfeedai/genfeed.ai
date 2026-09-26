import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { EvalDispatcher, EvalStructuredRequest } from './contracts';
import {
  canonicalJson,
  chargeableUsage,
  MeteredCallError,
  meteredCall,
  toRepoRelativePath,
} from './provenance';
import {
  EvalDispatchError,
  reservationCostUsd,
  SpendCapExceededError,
  SpendLedger,
  usdToCredits,
} from './spend';

const MODEL = 'google/gemini-2.5-flash-lite';

const REQUEST: EvalStructuredRequest<{ text: string }> = {
  maxTokens: 100,
  messages: [{ content: 'Write a post.', role: 'user' }],
  model: MODEL,
  role: 'generation',
  schema: z.object({ text: z.string() }),
  schemaName: 'test',
  seed: 1,
  temperature: 0,
};

const CONTEXT = {
  rowId: 'row-1',
  rubricDigest: null,
  rubricVersion: null,
};

function failingDispatcher(error: unknown): EvalDispatcher {
  return {
    async close() {},
    async completeStructured() {
      throw error;
    },
    kind: 'stub',
  };
}

describe('chargeableUsage', () => {
  it('prefers the provider-reported cost', () => {
    expect(
      chargeableUsage(
        MODEL,
        { completionTokens: 10, costUsd: 0.002, promptTokens: 10 },
        1,
      ),
    ).toEqual({ costEvidence: 'reported', costUsd: 0.002 });
  });

  it('prices reported tokens from the catalogue when no cost came back', () => {
    const charged = chargeableUsage(
      MODEL,
      { completionTokens: 1000, costUsd: null, promptTokens: 1000 },
      1,
    );
    expect(charged.costEvidence).toBe('catalogue');
    expect(charged.costUsd).toBeGreaterThan(0);
  });

  it('charges the reservation when usage is missing, empty or unpriceable', () => {
    expect(chargeableUsage(MODEL, null, 0.5)).toEqual({
      costEvidence: 'reservation',
      costUsd: 0.5,
    });
    expect(
      chargeableUsage(
        MODEL,
        { completionTokens: 0, costUsd: null, promptTokens: 0 },
        0.5,
      ),
    ).toEqual({ costEvidence: 'reservation', costUsd: 0.5 });
    expect(
      chargeableUsage(
        'unknown/model',
        { completionTokens: 10, costUsd: null, promptTokens: 10 },
        0.5,
      ),
    ).toEqual({ costEvidence: 'reservation', costUsd: 0.5 });
  });
});

describe('meteredCall', () => {
  it('charges a failed call with the usage the provider reported', async () => {
    const ledger = new SpendLedger(100);
    const error = new EvalDispatchError(
      'schema repair failed',
      { completionTokens: 200, costUsd: 0.004, promptTokens: 300 },
      'openrouter:Google',
      1200,
    );

    await expect(
      meteredCall(
        { ...CONTEXT, dispatcher: failingDispatcher(error), ledger },
        REQUEST,
      ),
    ).rejects.toBeInstanceOf(MeteredCallError);
    expect(ledger.calls).toHaveLength(1);
    expect(ledger.calls[0]).toMatchObject({
      costEvidence: 'reported',
      costUsd: 0.004,
      isFailed: true,
      latencyMs: 1200,
      provider: 'openrouter:Google',
    });
    expect(ledger.summary().spentCredits).toBeCloseTo(0.4);
  });

  it('charges the reservation when a call fails with nothing known', async () => {
    const ledger = new SpendLedger(100);

    await expect(
      meteredCall(
        {
          ...CONTEXT,
          dispatcher: failingDispatcher(new Error('timeout')),
          ledger,
        },
        REQUEST,
      ),
    ).rejects.toThrow('timeout');
    expect(ledger.calls[0]).toMatchObject({
      costEvidence: 'reservation',
      isFailed: true,
      provider: 'unknown',
    });
    expect(ledger.calls[0]?.credits).toBeGreaterThan(0);
  });

  it('lets the spend cap outrank a dispatch failure', async () => {
    const reserved = usdToCredits(
      reservationCostUsd(MODEL, 1, REQUEST.maxTokens),
    );
    const error = new EvalDispatchError(
      'failed',
      { completionTokens: 1, costUsd: 5, promptTokens: 1 },
      'stub',
      0,
    );
    const ledger = new SpendLedger(Math.max(reserved * 10, 1));

    await expect(
      meteredCall(
        { ...CONTEXT, dispatcher: failingDispatcher(error), ledger },
        REQUEST,
      ),
    ).rejects.toBeInstanceOf(SpendCapExceededError);
  });
});

describe('canonicalJson', () => {
  it('orders keys by code point, independent of insertion order', () => {
    expect(canonicalJson({ b: 1, B: 2, a: { z: 1, Z: 2 } })).toBe(
      '{"B":2,"a":{"Z":2,"z":1},"b":1}',
    );
  });
});

describe('toRepoRelativePath', () => {
  it('keeps repo paths relative and never reports an outside absolute path', () => {
    expect(toRepoRelativePath('scripts/content-eval/run.ts')).toBe(
      'scripts/content-eval/run.ts',
    );
    expect(toRepoRelativePath('/tmp/private/fixture.jsonl')).toBe(
      'external:fixture.jsonl',
    );
  });
});
