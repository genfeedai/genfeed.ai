/**
 * Contestant comparison shared by the text ladder (contestants differ by
 * model, same brief) and the harness A/B (same model, guidance arm differs).
 * The first contestant is the baseline; every other contestant is judged
 * against it on identical rows, pointwise and in both Battle orderings.
 */

import { z } from 'zod';
import type {
  Contestant,
  ContestantAnswer,
  ContestantProvenance,
  ContestantSummary,
  EvalMessage,
  FixtureRow,
  JudgeVote,
  PairJudging,
  PairwiseChoice,
  PairwiseResult,
  ScoredRow,
  SuiteContext,
  SuiteName,
  SuiteOutcome,
  SuiteRunner,
  ThresholdCheck,
} from '../contracts';
import { CONTENT_EVAL_THRESHOLDS } from '../contracts';
import { requireModelFamily } from '../families';
import { meteredCall } from '../provenance';
import { hasPassedAll, runDeterministicChecks } from '../scorers/deterministic';
import {
  orderedChoice,
  pointwiseChoice,
  positionBiasRate,
  reconcileVerdict,
} from '../scorers/pairwise';
import { SpendCapExceededError, UnmeteredCallError } from '../spend';
import {
  atMost,
  humanLabelOf,
  judgeText,
  mean,
  percentile,
  rate,
  sumCalls,
} from './shared';

export const GENERATION_SCHEMA_NAME = 'content_eval_generation';
const GENERATION_MAX_TOKENS = 1024;
const GENERATION_TEMPERATURE = 0.7;

const generationSchema = z.object({ text: z.string().min(1) });

/** The prompt a contestant sees. `raw` is the bare request; `brief` adds rules. */
export function buildGenerationMessages(
  row: FixtureRow,
  contestant: Contestant,
): EvalMessage[] {
  const user: EvalMessage = { content: row.input.prompt, role: 'user' };
  if (contestant.guidanceArm === 'raw') {
    return [user];
  }

  const { brief, platform } = row.input;
  const rules = [
    brief.guidance,
    platform ? `Platform: ${platform}.` : null,
    brief.maxCharacters
      ? `Stay under ${brief.maxCharacters} characters.`
      : null,
    brief.bannedPhrases.length > 0
      ? `Never use: ${brief.bannedPhrases.join('; ')}.`
      : null,
    brief.isCtaRequired ? 'End with a clear call to action.' : null,
  ].filter((rule): rule is string => Boolean(rule));

  return rules.length === 0
    ? [user]
    : [{ content: rules.join('\n'), role: 'system' }, user];
}

function isFatal(error: unknown): boolean {
  return (
    error instanceof SpendCapExceededError ||
    error instanceof UnmeteredCallError
  );
}

async function answerRow(
  context: SuiteContext,
  suite: SuiteName,
  row: FixtureRow,
  contestant: Contestant,
): Promise<ContestantAnswer> {
  const provenance: ContestantProvenance = {
    family: requireModelFamily(contestant.registryKey),
    guidanceArm: contestant.guidanceArm,
    id: contestant.id,
    isCompiled: contestant.isCompiled,
    model: contestant.registryKey,
    modelVersion: null,
    provider: null,
    registryKey: contestant.registryKey,
  };
  const base = {
    artifactRef: null,
    brandFixtureId: row.brandFixtureId,
    contentKind: row.contentKind,
    fixtureId: row.id,
    fixtureVisibility: row.source.visibility,
    humanLabel: humanLabelOf(row),
    rubricVersion: row.rubricVersion,
    runId: context.runId,
    suite,
  };

  let text: string;
  let generationCallId: string;
  try {
    const generated = await meteredCall(
      {
        dispatcher: context.dispatcher,
        ledger: context.ledger,
        rowId: row.id,
        rubricDigest: null,
        rubricVersion: null,
      },
      {
        maxTokens: GENERATION_MAX_TOKENS,
        messages: buildGenerationMessages(row, contestant),
        model: contestant.registryKey,
        role: 'generation',
        schema: generationSchema,
        schemaName: GENERATION_SCHEMA_NAME,
        seed: context.config.seed,
        temperature: GENERATION_TEMPERATURE,
      },
    );
    text = generated.response.value.text;
    generationCallId = generated.provenance.callId;
    provenance.modelVersion = generated.provenance.modelVersion;
    provenance.provider = generated.provenance.provider;
  } catch (error: unknown) {
    if (isFatal(error)) {
      throw error;
    }

    return {
      scoredRow: {
        ...base,
        callIds: [],
        contestant: provenance,
        costCredits: 0,
        deterministicChecks: [],
        isAccepted: null,
        latencyMs: 0,
        output: null,
        voidReason: `generation failed: ${error instanceof Error ? error.message : String(error)}`,
        votes: [],
      },
      text: null,
    };
  }

  const checks = runDeterministicChecks(text, row);
  const judged = await judgeText(context, row, text);
  const callIds = [generationCallId, ...judged.callIds];
  const totals = sumCalls(context.ledger, callIds);

  return {
    scoredRow: {
      ...base,
      callIds,
      contestant: provenance,
      costCredits: totals.credits,
      deterministicChecks: checks,
      isAccepted:
        judged.score === null
          ? null
          : hasPassedAll(checks) &&
            judged.score >= CONTENT_EVAL_THRESHOLDS.acceptedMinScore,
      latencyMs: totals.latencyMs,
      output: text,
      voidReason:
        judged.score === null
          ? `judging failed: ${judged.failures.join('; ')}`
          : null,
      votes: judged.votes,
    },
    text,
  };
}

function majority(
  choices: Array<PairwiseChoice | null>,
): PairwiseChoice | null {
  const counted = choices.filter(
    (choice): choice is PairwiseChoice => choice !== null,
  );
  if (counted.length === 0) {
    return null;
  }

  const wins = counted.filter((choice) => choice === 'a').length;
  const losses = counted.filter((choice) => choice === 'b').length;
  if (wins > counted.length / 2) {
    return 'a';
  }
  if (losses > counted.length / 2) {
    return 'b';
  }

  return 'tie';
}

async function comparePair(
  context: SuiteContext,
  row: FixtureRow,
  baseline: ContestantAnswer,
  challenger: ContestantAnswer,
): Promise<PairJudging> {
  const baselineId = baseline.scoredRow.contestant?.id ?? 'baseline';
  const challengerId = challenger.scoredRow.contestant?.id ?? 'challenger';
  const base = {
    baselineId,
    challengerId,
    contentKind: row.contentKind,
    fixtureId: row.id,
  };

  if (baseline.text === null || challenger.text === null) {
    return {
      biasFlags: [],
      pair: {
        ...base,
        battleVotes: [],
        isPositionBiased: null,
        orderedChoice: null,
        pointwiseChoice: null,
        verdict: null,
        voidReason:
          baseline.text === null
            ? 'baseline generation failed'
            : 'challenger generation failed',
      },
    };
  }

  const battleVotes: JudgeVote[] = [];
  const biasFlags: Array<boolean | null> = [];
  const orderedChoices: Array<PairwiseChoice | null> = [];
  for (const judgeRegistryKey of context.config.judgeRegistryKeys) {
    const challengerFirst = await context.judge.battle({
      first: challenger.text,
      judgeRegistryKey,
      row,
      second: baseline.text,
    });
    const baselineFirst = await context.judge.battle({
      first: baseline.text,
      judgeRegistryKey,
      row,
      second: challenger.text,
    });
    // Votes are recorded from the challenger's side: a = challenger.
    battleVotes.push(challengerFirst.vote, {
      ...baselineFirst.vote,
      choice:
        baselineFirst.vote.choice === null
          ? null
          : baselineFirst.vote.choice === 'a'
            ? 'b'
            : 'a',
    });
    const ordered = orderedChoice(
      challengerFirst.isFirstPreferred,
      baselineFirst.isFirstPreferred,
    );
    orderedChoices.push(ordered.choice);
    biasFlags.push(ordered.isPositionBiased);
  }

  const ordered = majority(orderedChoices);
  const pointwise = pointwiseChoice(
    mean(scoresFromRow(challenger.scoredRow)),
    mean(scoresFromRow(baseline.scoredRow)),
    context.config.tieBand,
  );
  const verdict = reconcileVerdict(ordered, pointwise);
  const measuredFlags = biasFlags.filter(
    (flag): flag is boolean => flag !== null,
  );

  return {
    biasFlags,
    pair: {
      ...base,
      battleVotes,
      isPositionBiased:
        measuredFlags.length === 0 ? null : measuredFlags.some(Boolean),
      orderedChoice: ordered,
      pointwiseChoice: pointwise,
      verdict,
      voidReason: verdict === null ? 'no judge produced a verdict' : null,
    },
  };
}

function scoresFromRow(row: ScoredRow): number[] {
  return row.votes
    .map((vote) => vote.score)
    .filter((score): score is number => score !== null);
}

function summarizeContestant(
  context: SuiteContext,
  contestant: Contestant,
  isBaseline: boolean,
  rows: ScoredRow[],
  pairs: PairwiseResult[],
): ContestantSummary {
  const own = rows.filter((row) => row.contestant?.id === contestant.id);
  const answered = own.filter((row) => row.voidReason === null);
  const accepted = answered.filter((row) => row.isAccepted === true);
  const battleCallIds = pairs
    .filter((pair) => pair.challengerId === contestant.id)
    .flatMap((pair) => pair.battleVotes.map((vote) => vote.callId))
    .filter((callId): callId is string => callId !== null);
  const spentCredits =
    own.reduce((sum, row) => sum + row.costCredits, 0) +
    sumCalls(context.ledger, battleCallIds).credits;
  const latencies = answered.map((row) => row.latencyMs);
  const ownPairs = pairs.filter((pair) => pair.challengerId === contestant.id);
  const decided = ownPairs.filter((pair) => pair.verdict !== null);

  return {
    acceptedCount: accepted.length,
    contestantId: contestant.id,
    creditsPerAcceptedOutput:
      accepted.length === 0 ? null : spentCredits / accepted.length,
    deterministicPassRate:
      answered.length === 0
        ? null
        : rate(
            answered.filter((row) => hasPassedAll(row.deterministicChecks))
              .length,
            answered.length,
          ),
    latencyP50Ms: percentile(latencies, 0.5),
    latencyP95Ms: percentile(latencies, 0.95),
    meanScore: mean(answered.flatMap(scoresFromRow)),
    rows: own.length,
    spentCredits,
    voidRate: rate(own.length - answered.length, own.length),
    vsBaseline: isBaseline
      ? null
      : {
          lossRate: rate(
            decided.filter((pair) => pair.verdict === 'b').length,
            decided.length,
          ),
          pairs: ownPairs.length,
          tieRate: rate(
            decided.filter((pair) => pair.verdict === 'tie').length,
            decided.length,
          ),
          voidRate: rate(ownPairs.length - decided.length, ownPairs.length),
          winRate: rate(
            decided.filter((pair) => pair.verdict === 'a').length,
            decided.length,
          ),
        },
  };
}

export function createComparisonSuite(suite: SuiteName): SuiteRunner {
  return {
    async run(context, onProgress) {
      const { contestants } = context.config;
      const [baseline, ...challengers] = contestants;
      if (!baseline || challengers.length === 0) {
        throw new Error(
          `${suite} needs a baseline and at least one challenger`,
        );
      }

      const rows: ScoredRow[] = [];
      const pairs: PairwiseResult[] = [];
      const biasFlags: Array<boolean | null> = [];

      const outcomeOf = (isFinal: boolean): SuiteOutcome => {
        const summaries = contestants.map((contestant, index) =>
          summarizeContestant(context, contestant, index === 0, rows, pairs),
        );
        const biasRate = positionBiasRate(biasFlags);
        const thresholdChecks: ThresholdCheck[] = isFinal
          ? [
              ...summaries.map((summary) =>
                atMost(
                  'max-void-rate',
                  summary.contestantId,
                  summary.voidRate,
                  CONTENT_EVAL_THRESHOLDS.maxVoidRate,
                ),
              ),
              atMost(
                'max-position-bias-rate',
                'battle judges',
                biasRate,
                CONTENT_EVAL_THRESHOLDS.maxPositionBiasRate,
              ),
            ]
          : [];

        return {
          contestants: summaries,
          judges: [],
          pairs: [...pairs],
          positionBiasRate: biasRate,
          rows: [...rows],
          thresholdChecks,
        };
      };

      for (const row of context.rows) {
        const baselineAnswer = await answerRow(context, suite, row, baseline);
        rows.push(baselineAnswer.scoredRow);
        onProgress(outcomeOf(false));

        for (const challenger of challengers) {
          const answer = await answerRow(context, suite, row, challenger);
          rows.push(answer.scoredRow);
          onProgress(outcomeOf(false));

          const judged = await comparePair(
            context,
            row,
            baselineAnswer,
            answer,
          );
          pairs.push(judged.pair);
          biasFlags.push(...judged.biasFlags);
          onProgress(outcomeOf(false));
        }
      }

      return outcomeOf(true);
    },
    suite,
  };
}

export const ladderSuite = createComparisonSuite('ladder');
export const harnessAbSuite = createComparisonSuite('harness-ab');
