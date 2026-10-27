import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { UsageError } from '../cli';
import type { ContentEvalRunOptions } from '../contracts';
import { contentEvalReportSchema } from '../contracts';
import { createStubDispatcher } from '../dispatchers/stub';
import { CrossFamilyViolationError } from '../families';
import { runContentEval } from '../runner';

const FIXTURE = fileURLToPath(
  new URL(
    '../../../apps/server/api/test/fixtures/content-evals/smoke/text.synthetic.jsonl',
    import.meta.url,
  ),
);
const RAW_MODEL = 'deepseek/deepseek-v4-flash-0731';
const JUDGE = 'openai/gpt-5.6-luna';

function options(
  overrides: Partial<ContentEvalRunOptions> = {},
): ContentEvalRunOptions {
  return {
    argv: [],
    createDispatcher: async () => createStubDispatcher(),
    dispatcherKind: 'stub',
    fixturePath: FIXTURE,
    judgeRegistryKeys: [JUDGE],
    maxCredits: 100,
    models: [RAW_MODEL],
    now: new Date('2026-10-26T12:00:00.000Z'),
    runId: 'product-ab-test',
    seed: 1,
    suite: 'product-ab',
    tieBand: 0.05,
    ...overrides,
  };
}

describe('product-ab suite (stub dispatcher and stub product port)', () => {
  it('compares the raw model against the product pipeline on the routed kinds only', async () => {
    const { report } = await runContentEval(options());

    expect(() => contentEvalReportSchema.parse(report)).not.toThrow();
    expect(report).toMatchObject({
      aborted: null,
      evidenceKind: 'stub-dispatcher',
      modelQualityAssessed: false,
      suite: 'product-ab',
    });
    expect(report.config.contestants.map((c) => c.guidanceArm)).toEqual([
      'raw',
      'product',
    ]);
    // Two rows each for social-post, linkedin-post, thread and reply; the
    // five kinds without a product route stay out of the run.
    expect(report.fixture.rowCount).toBe(8);
    expect(
      [...new Set(report.outcome.rows.map((row) => row.contentKind))].sort(),
    ).toEqual(['linkedin-post', 'reply', 'social-post', 'thread']);
    expect(report.outcome.rows).toHaveLength(16);
    expect(report.outcome.pairs).toHaveLength(8);
  });

  it('records the product generation as a charged call with its own provenance', async () => {
    const { report } = await runContentEval(options());

    const productRows = report.outcome.rows.filter(
      (row) => row.contestant?.guidanceArm === 'product',
    );
    expect(productRows).toHaveLength(8);
    for (const row of productRows) {
      expect(row.voidReason).toBeNull();
      expect(row.contestant).toMatchObject({
        isCompiled: true,
        provider: 'genfeed-product-api',
      });
      expect(row.costCredits).toBeGreaterThan(0);
    }
    const productCalls = report.calls.filter(
      (call) => call.provider === 'genfeed-product-api',
    );
    expect(productCalls).toHaveLength(8);
    for (const call of productCalls) {
      expect(call).toMatchObject({
        costEvidence: 'reservation',
        kind: 'generation',
      });
    }
    expect([
      ...new Set(
        productCalls.map(
          (call) => (call.settings as { endpoint: string }).endpoint,
        ),
      ),
    ]).toEqual(['stub']);
    const spentOnProduct = productCalls.reduce(
      (sum, call) => sum + call.credits,
      0,
    );
    expect(report.spend.byKind.generation).toBeGreaterThanOrEqual(
      spentOnProduct,
    );
    expect(report.spend.spentCredits).toBeLessThanOrEqual(100);
  });

  it('stops with a partial report when the cap cannot cover the next product call', async () => {
    const { exitCode, report } = await runContentEval(
      options({ maxCredits: 3 }),
    );

    expect(report.aborted).toBe('spend');
    expect(report.passed).toBe(false);
    expect(exitCode).toBe(1);
    expect(report.spend.spentCredits).toBeLessThanOrEqual(3);
  });

  it('refuses a judge from the family the product model belongs to, before any call', async () => {
    await expect(
      runContentEval(
        options({ judgeRegistryKeys: ['google/gemini-3.5-flash-lite'] }),
      ),
    ).rejects.toThrow(CrossFamilyViolationError);
  });

  it('holds the raw arm fixed to one model', async () => {
    await expect(
      runContentEval(options({ models: [RAW_MODEL, 'openai/gpt-5.6-terra'] })),
    ).rejects.toThrow(UsageError);
  });

  it('demands the product API and the eval brand for a live run', async () => {
    const live = options({ dispatcherKind: 'live' });
    await expect(runContentEval(live)).rejects.toThrow(/--genfeed-api-url/);
    await expect(
      runContentEval({
        ...live,
        argv: ['--genfeed-api-url=https://api.example.test'],
      }),
    ).rejects.toThrow(/--brands=kelder/);
  });
});
