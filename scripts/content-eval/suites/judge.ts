/**
 * Judge suite: production and harness judges score already-written text
 * against human labels, with swapped-pair battles for harness position bias.
 * --production-judges=content-quality,evaluations selects production profiles.
 * --cross-family-judges=model,... adds cross-family arms.
 * --brand-context=path adds the criteria arm where a brand entry exists.
 * --fixture=path,... combines fixtures in flag order.
 */

import { readFileSync } from 'node:fs';
import {
  buildCalibrationSection,
  pooledPositionBiasRate,
} from '../calibration/analyze';
import {
  buildGoldenPairs,
  collectPairJudgements,
  collectRowArmScores,
  harnessArmScores,
} from '../calibration/collect';
import type {
  ArmScore,
  BrandContextFile,
  ProductionProfileId,
} from '../calibration/contracts';
import {
  brandContextFileSchema,
  PRODUCTION_PROFILE_IDS,
} from '../calibration/contracts';
import {
  buildArmSpecs,
  createStubEvaluationsScorer,
} from '../calibration/judges';
import { computeScoringSurface } from '../calibration/scoring-surface';
import type {
  EvaluationsScorerPort,
  JudgeSuiteFlags,
  JudgeSuitePlan,
  PairJudgement,
} from '../calibration/types';
import { readFlag, UsageError } from '../cli';
import type {
  JudgeSummary,
  LoadedFixture,
  ScoreBand,
  ScoredRow,
  SuiteContext,
  SuiteOutcome,
  SuiteRunner,
} from '../contracts';
import { CONTENT_EVAL_THRESHOLDS } from '../contracts';
import { loadFixture } from '../fixtures';
import { canonicalJson, resolveRepoPath, sha256Digest } from '../provenance';
import {
  compileOutputSchema,
  hasPassedAll,
  runDeterministicChecks,
} from '../scorers/deterministic';
import { resolvePointwiseRubric } from '../scorers/judge';
import {
  atLeast,
  humanLabelOf,
  judgeText,
  mean,
  rate,
  sumCalls,
} from './shared';

/** 0 inside the band, otherwise the distance to its nearest edge. */
export function distanceToBand(score: number, band: ScoreBand): number {
  if (score < band.min) {
    return band.min - score;
  }
  if (score > band.max) {
    return score - band.max;
  }

  return 0;
}

export function summarizeJudges(
  judgeRegistryKeys: string[],
  rows: ScoredRow[],
): JudgeSummary[] {
  return judgeRegistryKeys.map((judgeRegistryKey) => {
    const scored = rows.flatMap((row) => {
      const score =
        row.votes.find((vote) => vote.judgeRegistryKey === judgeRegistryKey)
          ?.score ?? null;
      return score === null ? [] : [{ band: row.humanLabel?.band, score }];
    });
    const labelled = scored.flatMap(({ band, score }) =>
      band ? [distanceToBand(score, band)] : [],
    );

    return {
      bandAgreement:
        labelled.length === 0
          ? null
          : rate(
              labelled.filter((distance) => distance === 0).length,
              labelled.length,
            ),
      judgeRegistryKey,
      labelledRows: labelled.length,
      meanAbsoluteError: mean(labelled),
      scoredRows: scored.length,
    };
  });
}

function outcomeOf(
  context: SuiteContext,
  rows: ScoredRow[],
  isFinal: boolean,
  plan: JudgeSuitePlan,
  scores: ArmScore[],
  pairJudgements: PairJudgement[],
): SuiteOutcome {
  const judges = summarizeJudges(context.config.judgeRegistryKeys, rows);
  const calibration = buildCalibrationSection({
    arms: plan.arms,
    calls: context.ledger.calls,
    harnessJudgeKeys: context.config.judgeRegistryKeys,
    pairJudgements,
    plan: plan.calibration,
    rows: context.rows,
    scores,
    skippedCrossFamily: plan.skippedCrossFamily,
  });

  return {
    calibration: calibration.section,
    contestants: [],
    judges,
    pairs: [],
    positionBiasRate: pooledPositionBiasRate(pairJudgements),
    rows,
    thresholdChecks: isFinal
      ? [
          ...judges.map((judge) =>
            atLeast(
              'judge-band-agreement',
              judge.judgeRegistryKey,
              judge.bandAgreement,
              CONTENT_EVAL_THRESHOLDS.judgeMinBandAgreement,
            ),
          ),
          ...calibration.thresholdChecks,
        ]
      : [],
  };
}

function readBrandContext(path: string): BrandContextFile {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(resolveRepoPath(path), 'utf8'));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new UsageError(
      `--brand-context=${path} is not a readable JSON file: ${message}`,
    );
  }
  const parsed = brandContextFileSchema.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new UsageError(`--brand-context=${path} is invalid: ${issues}`);
  }
  return parsed.data;
}

export function parseJudgeSuiteFlags(argv: string[]): JudgeSuiteFlags {
  const raw =
    readFlag(argv, 'production-judges') ?? 'content-quality,evaluations';
  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0) {
    throw new UsageError(
      '--production-judges needs at least one of content-quality, evaluations',
    );
  }
  const productionProfiles: ProductionProfileId[] = [];
  for (const value of values) {
    const profile = PRODUCTION_PROFILE_IDS.find((id) => id === value);
    if (profile === undefined) {
      throw new UsageError(
        `--production-judges must be from content-quality, evaluations, got "${value}"`,
      );
    }
    if (productionProfiles.includes(profile)) {
      throw new UsageError(`--production-judges repeats "${value}"`);
    }
    productionProfiles.push(profile);
  }
  const crossFamilyModels = (readFlag(argv, 'cross-family-judges') ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  for (const key of crossFamilyModels) {
    if (seen.has(key)) {
      throw new UsageError(`--cross-family-judges repeats "${key}"`);
    }
    seen.add(key);
  }
  const brandContextPath = readFlag(argv, 'brand-context') ?? null;
  if (brandContextPath === '') {
    throw new UsageError('--brand-context needs a path to a JSON file');
  }
  return { brandContextPath, crossFamilyModels, productionProfiles };
}

function loadJudgeFixture(fixturePath: string): LoadedFixture {
  const paths = fixturePath
    .split(',')
    .map((path) => path.trim())
    .filter(Boolean);
  if (paths.length === 0) {
    throw new UsageError('--fixture needs at least one path');
  }
  const files = paths.map(loadFixture);
  const first = files[0];
  if (files.length === 1 && first !== undefined) {
    return first;
  }
  const rows = files.flatMap((file) => file.rows);
  const ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.id)) {
      throw new Error(`Fixture rows repeat id "${row.id}" across files`);
    }
    ids.add(row.id);
  }
  return {
    digest: sha256Digest(
      canonicalJson(files.map(({ path, digest }) => ({ digest, path }))),
    ),
    path: files.map((file) => file.path).join('+'),
    rows,
  };
}

export function createJudgeSuite(): SuiteRunner {
  let plan: JudgeSuitePlan | null = null;
  return {
    async prepare(options) {
      const flags = parseJudgeSuiteFlags(options.argv ?? []);
      const fixture = loadJudgeFixture(options.fixturePath);
      for (const row of fixture.rows) {
        resolvePointwiseRubric(row.rubricVersion);
        if (row.input.brief.outputJsonSchema) {
          compileOutputSchema(row.input.brief.outputJsonSchema);
        }
        if (row.input.output === undefined) {
          throw new Error(
            `${fixture.path}: judge row ${row.id} needs input.output (the text to score)`,
          );
        }
      }
      const calibration = {
        brandContext:
          flags.brandContextPath === null
            ? null
            : readBrandContext(flags.brandContextPath),
        crossFamilyModels: flags.crossFamilyModels,
        productionProfiles: flags.productionProfiles,
        scoringSurface: computeScoringSurface(),
      };
      plan = {
        ...buildArmSpecs({
          dispatcherKind: options.dispatcherKind,
          harnessJudgeKeys: options.judgeRegistryKeys,
          plan: calibration,
        }),
        calibration,
      };
      return { contestants: [], crossFamily: 'run', fixture };
    },
    async run(context, onProgress) {
      if (plan === null) {
        throw new Error('judge suite ran without prepare()');
      }
      const current = plan;
      const rows: ScoredRow[] = [];
      const scores: ArmScore[] = [];
      const scorerOptions = {
        dispatcher: context.dispatcher,
        ledger: context.ledger,
        seed: context.config.seed,
      };
      let evaluations: EvaluationsScorerPort | null = null;
      onProgress(outcomeOf(context, rows, false, current, scores, []));
      try {
        if (current.calibration.productionProfiles.includes('evaluations')) {
          evaluations =
            context.dispatcher.kind === 'live'
              ? await (
                  await import('../calibration/live-evaluations')
                ).createLiveEvaluationsScorer(scorerOptions)
              : createStubEvaluationsScorer(scorerOptions);
        }
        for (const row of context.rows) {
          // Every row was checked in prepare before a dispatcher existed.
          const output = row.input.output;
          if (output === undefined) {
            throw new Error(`Judge fixture row ${row.id} has no input.output`);
          }

          const checks = runDeterministicChecks(output, row);
          const judged = await judgeText(context, row, output);
          const totals = sumCalls(context.ledger, judged.callIds);
          const scoredRow: ScoredRow = {
            artifactRef: null,
            brandFixtureId: row.brandFixtureId,
            callIds: judged.callIds,
            contentKind: row.contentKind,
            contestant: null,
            costCredits: totals.credits,
            deterministicChecks: checks,
            fixtureId: row.id,
            fixtureVisibility: row.source.visibility,
            humanLabel: humanLabelOf(row),
            isAccepted:
              judged.score === null
                ? null
                : hasPassedAll(checks) &&
                  judged.score >= CONTENT_EVAL_THRESHOLDS.acceptedMinScore,
            latencyMs: totals.latencyMs,
            output,
            rubricVersion: row.rubricVersion,
            runId: context.runId,
            suite: 'judge',
            voidReason:
              judged.score === null ? judged.failures.join('; ') || null : null,
            votes: judged.votes,
          };
          rows.push(scoredRow);
          scores.push(...harnessArmScores(current.arms, row, scoredRow));
          scores.push(
            ...(await collectRowArmScores(
              context,
              current.calibration,
              current.arms,
              row,
              output,
              evaluations,
            )),
          );
          onProgress(outcomeOf(context, rows, false, current, scores, []));
        }

        const pairJudgements = await collectPairJudgements(
          context,
          buildGoldenPairs(context.rows),
        );
        return outcomeOf(context, rows, true, current, scores, pairJudgements);
      } finally {
        if (evaluations !== null) {
          await evaluations.close();
        }
      }
    },
    suite: 'judge',
  };
}

export const judgeSuite: SuiteRunner = createJudgeSuite();
