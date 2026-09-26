/**
 * Judge suite: each production judge scores already-written text, and the
 * score is compared with the human band on the row. Phase 1 reports band
 * agreement and distance to the band; Spearman ρ, Cohen's κ and swapped-pair
 * position bias arrive with the golden set in #4924.
 */

import type {
  JudgeSummary,
  ScoredRow,
  SuiteContext,
  SuiteOutcome,
  SuiteRunner,
} from '../contracts';
import { CONTENT_EVAL_THRESHOLDS } from '../contracts';
import { hasPassedAll, runDeterministicChecks } from '../scorers/deterministic';
import {
  atLeast,
  humanLabelOf,
  judgeText,
  mean,
  rate,
  sumCalls,
} from './shared';

/** 0 inside the band, otherwise the distance to its nearest edge. */
export function distanceToBand(
  score: number,
  band: { max: number; min: number },
): number {
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
): SuiteOutcome {
  const judges = summarizeJudges(context.config.judgeRegistryKeys, rows);

  return {
    contestants: [],
    judges,
    pairs: [],
    positionBiasRate: null,
    rows,
    thresholdChecks: isFinal
      ? judges.map((judge) =>
          atLeast(
            'judge-band-agreement',
            judge.judgeRegistryKey,
            judge.bandAgreement,
            CONTENT_EVAL_THRESHOLDS.judgeMinBandAgreement,
          ),
        )
      : [],
  };
}

export const judgeSuite: SuiteRunner = {
  async run(context, onProgress) {
    const rows: ScoredRow[] = [];

    for (const row of context.rows) {
      const output = row.input.output;
      if (!output) {
        throw new Error(`Judge fixture row ${row.id} has no input.output`);
      }

      const checks = runDeterministicChecks(output, row);
      const judged = await judgeText(context, row, output);
      const totals = sumCalls(context.ledger, judged.callIds);
      rows.push({
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
      });
      onProgress(outcomeOf(context, rows, false));
    }

    return outcomeOf(context, rows, true);
  },
  suite: 'judge',
};
