/**
 * Run orchestration, separate from argv parsing so tests drive it with the
 * stub. Order matters: validate config, fixture, rubrics and the
 * cross-family rule first — nothing reaches a dispatcher until all of them
 * pass — then run the suite, and write a report even when the spend cap
 * stops it midway.
 */

import { randomUUID } from 'node:crypto';
import { REPORT_ANALYZERS } from './analyzers';
import { UsageError } from './cli';
import type {
  AbortReason,
  ContentEvalRunOptions,
  ContentEvalRunResult,
  Contestant,
  SuiteConfig,
  SuiteOutcome,
  SuitePreparation,
} from './contracts';
import { suiteConfigSchema } from './contracts';
import { assertCrossFamily } from './families';
import { loadFixture } from './fixtures';
import { readSourceRevision } from './provenance';
import { buildReport } from './report';
import { compileOutputSchema } from './scorers/deterministic';
import { createEvalJudge, resolvePointwiseRubric } from './scorers/judge';
import { SpendCapExceededError, SpendLedger } from './spend';
import { resolveSuiteRunner } from './suites';

const EMPTY_OUTCOME: SuiteOutcome = {
  contestants: [],
  judges: [],
  pairs: [],
  positionBiasRate: null,
  rows: [],
  thresholdChecks: [],
};

/** Ladder: one contestant per model. Harness A/B: one model, raw vs brief. */
export function buildContestants(
  suite: SuiteConfig['suite'],
  models: string[],
): Contestant[] {
  if (suite === 'judge') {
    return [];
  }
  if (suite === 'harness-ab') {
    const [model, ...extra] = models;
    if (!model || extra.length > 0) {
      throw new UsageError(
        'harness-ab holds the model fixed: pass exactly one --models key',
      );
    }

    return [
      {
        guidanceArm: 'raw',
        id: `${model}#raw`,
        isCompiled: false,
        registryKey: model,
      },
      {
        guidanceArm: 'brief',
        id: `${model}#brief`,
        isCompiled: false,
        registryKey: model,
      },
    ];
  }
  if (models.length < 2) {
    throw new UsageError(
      `${suite} compares candidates against a baseline: pass at least two --models keys, baseline first`,
    );
  }
  if (new Set(models).size !== models.length) {
    throw new UsageError('--models repeats a key');
  }

  return models.map((model) => ({
    guidanceArm: 'brief',
    id: model,
    isCompiled: false,
    registryKey: model,
  }));
}

/** Default preparation for the text suites. */
export function prepareTextSuite(
  options: ContentEvalRunOptions,
): SuitePreparation {
  const fixture = loadFixture(options.fixturePath);
  // Everything a row needs is checked here, before a dispatcher exists, so a
  // bad row never surfaces after earlier rows have already spent money.
  for (const row of fixture.rows) {
    resolvePointwiseRubric(row.rubricVersion);
    if (row.input.brief.outputJsonSchema) {
      compileOutputSchema(row.input.brief.outputJsonSchema);
    }
    if (options.suite === 'judge' && !row.input.output) {
      throw new Error(
        `${fixture.path}: judge row ${row.id} needs input.output (the text to score)`,
      );
    }
  }

  return {
    contestants: buildContestants(options.suite, options.models),
    crossFamily: 'run',
    fixture,
  };
}

export async function runContentEval(
  options: ContentEvalRunOptions,
): Promise<ContentEvalRunResult> {
  const runner = resolveSuiteRunner(options.suite);
  const preparation = runner.prepare
    ? await runner.prepare(options)
    : prepareTextSuite(options);
  const { fixture } = preparation;
  const config = suiteConfigSchema.parse({
    contestants: preparation.contestants,
    dispatcher: options.dispatcherKind,
    fixturePath: fixture.path,
    judgeRegistryKeys: options.judgeRegistryKeys,
    maxCredits: options.maxCredits,
    outlierThresholds: options.outlierThresholds,
    seed: options.seed,
    suite: options.suite,
    tieBand: options.tieBand,
  });
  if (preparation.crossFamily === 'run') {
    assertCrossFamily({
      generatorRegistryKeys: config.contestants.map(
        (contestant) => contestant.registryKey,
      ),
      judgeRegistryKeys: config.judgeRegistryKeys,
    });
  }

  const revision = readSourceRevision();
  const generatedAt = (options.now ?? new Date()).toISOString();
  const runId =
    options.runId ??
    `${config.suite}-${generatedAt.replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomUUID().slice(0, 8)}`;
  const ledger = new SpendLedger(config.maxCredits);
  const dispatcher = await options.createDispatcher(config.dispatcher);
  const judge = createEvalJudge({ dispatcher, ledger, seed: config.seed });

  let latest: SuiteOutcome = EMPTY_OUTCOME;
  let aborted: AbortReason | null = null;
  let abortMessage: string | null = null;
  try {
    latest = await runner.run(
      { config, dispatcher, judge, ledger, rows: fixture.rows, runId },
      (progress) => {
        latest = progress;
      },
    );
  } catch (error: unknown) {
    // Money may already be spent: record what ran, whatever stopped it.
    aborted = error instanceof SpendCapExceededError ? 'spend' : 'error';
    abortMessage = error instanceof Error ? error.message : String(error);
  } finally {
    await dispatcher.close();
  }

  const report = buildReport(
    {
      aborted,
      abortMessage,
      config,
      fixture,
      generatedAt,
      outcome: latest,
      revision,
      rubrics: judge.rubrics(),
      runId,
      spend: { calls: ledger.calls, summary: ledger.summary() },
    },
    REPORT_ANALYZERS,
  );

  return { exitCode: report.passed ? 0 : 1, report };
}
