import { formatScorerHarnessCriteria } from '@api/services/content-quality/content-quality-scorer.prompts';
import type { FixtureRow, ScoredRow, SuiteContext } from '../contracts';
import type { ArmScore, ArmSpec } from './contracts';
import { scoreContentQualityArm, toArmScore } from './judges';
import type {
  CalibrationPlan,
  EvaluationsScorerPort,
  GoldenPair,
  PairJudgement,
} from './types';

export function harnessArmScores(
  arms: ArmSpec[],
  row: FixtureRow,
  scoredRow: ScoredRow,
): ArmScore[] {
  return arms
    .filter((arm) => arm.profileId === 'harness-rubric')
    .map((arm) => {
      const vote = scoredRow.votes.find(
        (entry) => entry.judgeRegistryKey === arm.model,
      );
      const nativeScore = vote?.score ?? null;
      return toArmScore(arm, row, {
        brandScore: null,
        callId: vote?.callId ?? null,
        failure: nativeScore === null ? 'no harness score' : null,
        nativeScore,
      });
    });
}

export async function collectRowArmScores(
  context: SuiteContext,
  plan: CalibrationPlan,
  arms: ArmSpec[],
  row: FixtureRow,
  output: string,
  evaluations: EvaluationsScorerPort | null,
): Promise<ArmScore[]> {
  const brands = new Map(Object.entries(plan.brandContext?.brands ?? {}));
  const scores: ArmScore[] = [];
  for (const arm of arms) {
    if (arm.profileId === 'harness-rubric') {
      continue;
    }
    if (arm.profileId === 'evaluations') {
      if (evaluations === null) {
        throw new Error('evaluations arm without an evaluations scorer');
      }
      scores.push(
        toArmScore(
          arm,
          row,
          await evaluations.score({ model: arm.model, output, row }),
        ),
      );
      continue;
    }
    let harnessCriteria: string | null = null;
    if (arm.profileId === 'content-quality+criteria') {
      const entry = brands.get(row.brandFixtureId);
      if (entry === undefined) {
        continue;
      }
      harnessCriteria = formatScorerHarnessCriteria(
        entry.evaluationCriteria,
        entry.goodExamples,
        entry.avoidExamples,
      );
    }
    scores.push(
      toArmScore(
        arm,
        row,
        await scoreContentQualityArm({
          context,
          harnessCriteria,
          model: arm.model,
          output,
          row,
        }),
      ),
    );
  }
  return scores;
}

export function buildGoldenPairs(rows: FixtureRow[]): GoldenPair[] {
  const labelled = rows.filter(
    (row) =>
      row.expected.decision !== undefined &&
      typeof row.input.output === 'string',
  );
  const kinds = [...new Set(labelled.map((row) => row.contentKind))];
  const pairs: GoldenPair[] = [];
  for (const contentKind of kinds) {
    const kindRows = labelled.filter((row) => row.contentKind === contentKind);
    const brands = [
      ...new Set(kindRows.map((row) => row.brandFixtureId)),
    ].sort();
    for (const brand of brands) {
      const brandRows = kindRows
        .filter((row) => row.brandFixtureId === brand)
        .sort((left, right) =>
          left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
        );
      const approved = brandRows.filter(
        (row) => row.expected.decision === 'approve',
      );
      const rejected = brandRows.filter(
        (row) => row.expected.decision === 'reject',
      );
      for (
        let index = 0;
        index < Math.min(approved.length, rejected.length);
        index += 1
      ) {
        const approveRow = approved[index];
        const rejectRow = rejected[index];
        if (approveRow !== undefined && rejectRow !== undefined) {
          pairs.push({ approveRow, contentKind, rejectRow });
        }
      }
    }
  }
  return pairs;
}

export async function collectPairJudgements(
  context: SuiteContext,
  pairs: GoldenPair[],
): Promise<PairJudgement[]> {
  const judgements: PairJudgement[] = [];
  for (const pair of pairs) {
    const first = pair.approveRow.input.output;
    const second = pair.rejectRow.input.output;
    if (typeof first !== 'string' || typeof second !== 'string') {
      continue;
    }
    for (const judgeRegistryKey of context.config.judgeRegistryKeys) {
      const approveFirst = await context.judge.battle({
        first,
        judgeRegistryKey,
        row: pair.approveRow,
        second,
      });
      const rejectFirst = await context.judge.battle({
        first: second,
        judgeRegistryKey,
        row: pair.approveRow,
        second: first,
      });
      judgements.push({
        approveFirstPreferred: approveFirst.isFirstPreferred,
        contentKind: pair.contentKind,
        judgeRegistryKey,
        rejectFirstPreferred: rejectFirst.isFirstPreferred,
      });
    }
  }
  return judgements;
}
