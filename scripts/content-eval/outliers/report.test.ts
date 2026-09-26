import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { REPORT_ANALYZERS } from '../analyzers';
import type { ContentEvalRunOptions } from '../contracts';
import { contentEvalReportSchema } from '../contracts';
import { createStubDispatcher } from '../dispatchers/stub';
import { buildReport, renderSummary } from '../report';
import { runContentEval } from '../runner';
import { DEFAULT_OUTLIER_THRESHOLDS, OUTLIER_CLASSES } from './contracts';
import {
  buildSyntheticFixtureRows,
  buildSyntheticOutlierPairs,
  buildSyntheticOutlierRows,
  SYNTHETIC_OUTLIER_RUN_ID,
} from './fixtures';

const LADDER_FIXTURE = fileURLToPath(
  new URL(
    '../../../apps/server/api/test/fixtures/content-evals/ladder/social-post.synthetic.jsonl',
    import.meta.url,
  ),
);

function options(
  overrides: Partial<ContentEvalRunOptions> = {},
): ContentEvalRunOptions {
  return {
    createDispatcher: async () => createStubDispatcher(),
    dispatcherKind: 'stub',
    fixturePath: LADDER_FIXTURE,
    judgeRegistryKeys: ['anthropic/claude-sonnet-5'],
    maxCredits: 50,
    models: ['google/gemini-2.5-flash-lite', 'openai/gpt-5.6-luna'],
    now: new Date('2026-09-26T12:00:00.000Z'),
    runId: 'outlier-ladder-test',
    seed: 7,
    suite: 'ladder',
    tieBand: 0.05,
    ...overrides,
  };
}

describe('outlier section in content-eval reports', () => {
  it('is written on every stub run with the default thresholds', async () => {
    const { report } = await runContentEval(options());

    expect(contentEvalReportSchema.safeParse(report).success).toBe(true);
    expect(report.outliers).toMatchObject({
      caseCount: report.outcome.rows.length,
      status: 'ok',
      thresholds: DEFAULT_OUTLIER_THRESHOLDS,
    });
  });

  it('records run-configured thresholds in config and section', async () => {
    const thresholds = {
      ...DEFAULT_OUTLIER_THRESHOLDS,
      costMultiple: 3,
      version: 'outlier-thresholds-test',
    };
    const { report } = await runContentEval(
      options({ outlierThresholds: thresholds }),
    );

    expect(report.config.outlierThresholds).toEqual(thresholds);
    expect(report.outliers?.thresholds).toEqual(thresholds);
  });

  it('rejects invalid thresholds before any provider call', async () => {
    const createDispatcher = vi.fn(async () => createStubDispatcher());

    await expect(
      runContentEval(
        options({
          createDispatcher,
          outlierThresholds: { ...DEFAULT_OUTLIER_THRESHOLDS, costMultiple: 1 },
        }),
      ),
    ).rejects.toThrow();
    expect(createDispatcher).not.toHaveBeenCalled();
  });

  it('still reports outliers on a spend-aborted run', async () => {
    const { report } = await runContentEval(
      options({
        createDispatcher: async () =>
          createStubDispatcher({ usdPerToken: 0.01 }),
        maxCredits: 1,
      }),
    );

    expect(report.aborted).toBe('spend');
    expect(report.outliers?.status).toBe('ok');
    expect(report.outliers?.caseCount).toBe(report.outcome.rows.length);
  });

  it('carries all four classes from a synthetic scored run into the report', async () => {
    const { report } = await runContentEval(options());
    const rows = buildSyntheticOutlierRows();
    const fixtureRows = [...buildSyntheticFixtureRows().values()];
    const synthetic = buildReport(
      {
        aborted: null,
        abortMessage: null,
        config: report.config,
        fixture: {
          digest: report.fixture.digest,
          path: 'scripts/content-eval/outliers/fixtures.ts',
          rows: fixtureRows,
        },
        generatedAt: report.generatedAt,
        outcome: {
          ...report.outcome,
          pairs: buildSyntheticOutlierPairs(),
          rows,
        },
        revision: {
          sourceRevision: report.sourceRevision,
          workingTreeDirty: report.workingTreeDirty,
        },
        rubrics: report.rubrics,
        runId: SYNTHETIC_OUTLIER_RUN_ID,
        spend: { calls: report.calls, summary: report.spend },
      },
      REPORT_ANALYZERS,
    );

    expect(contentEvalReportSchema.safeParse(synthetic).success).toBe(true);
    for (const outlierClass of OUTLIER_CLASSES) {
      expect(
        synthetic.outliers?.cases.some(
          (record) => record.class === outlierClass,
        ),
        outlierClass,
      ).toBe(true);
    }

    const summary = renderSummary(synthetic, REPORT_ANALYZERS);
    expect(summary).toContain(
      '  outliers (outlier-thresholds-v1): judge_human_disagreement 1 · judge_disagreement 2 · extreme_score 1 · cost_latency 2',
    );
    expect(summary).toContain('  outliers alpha-raw: 4/15 cases (26.7%)');
    expect(summary).toContain('  outliers beta-compiled: 1/4 cases (25.0%)');
    expect(summary).toContain('  outliers judged-output: 1/1 cases (100.0%)');
  });
});
