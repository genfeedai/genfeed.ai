import { z } from 'zod';
import type {
  ContestantSummary,
  JudgeVote,
  ScoredRow,
  SuiteOutcome,
  ThresholdCheck,
} from '../contracts';
import { CONTENT_EVAL_THRESHOLDS } from '../contracts';
import type {
  MediaContestant,
  MediaLadderSection,
  MediaTask,
} from './contracts';
import { MEDIA_RUBRIC_VERSION, mediaLadderSectionSchema } from './contracts';
import {
  ACCEPTED_ADHERENCE_THRESHOLD,
  collectAnswerAdherence,
} from './run-media-ladder';
import { schnellGridSummarySchema } from './schnell-grid';

/**
 * `report.media`: the ladder section plus the #3470 grid summary when the
 * grid ran. The generic report parts (scored rows, contestant summaries,
 * threshold checks, bench matches) are derived here so the harness report,
 * its summary and #5234 outlier analysis read media like any other suite.
 */

export const mediaReportSchema = z.object({
  ladder: mediaLadderSectionSchema,
  schnellGrid: schnellGridSummarySchema.nullable(),
  ratingSheetPath: z.string().nullable(),
  /** Product credits include margin; generation spend overstates vendor cost. */
  costNote: z.string(),
});

export type MediaReport = z.infer<typeof mediaReportSchema>;

export const MEDIA_COST_NOTE =
  'Generation charges are product retail credits (1 credit = $0.01, margin included); judge charges are vendor USD. Media spend therefore overstates vendor cost.';

function percentile(values: readonly number[], share: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((one, two) => one - two);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(share * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

function meanOf(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** One scored row per answer; votes are every panel vote cast on it. */
function toScoredRows(
  section: MediaLadderSection,
  tasks: ReadonlyMap<string, MediaTask>,
  runId: string,
): ScoredRow[] {
  const adherence = collectAnswerAdherence(section.matches);
  const byContestant = new Map(
    section.contestants.map((entry) => [entry.contestant.id, entry]),
  );
  return section.answers.map((answer) => {
    const contestant = byContestant.get(answer.contestantId);
    const task = tasks.get(answer.taskId);
    const votes: JudgeVote[] = section.matches.flatMap((record) => {
      const side =
        record.match.a.contestantId === answer.contestantId &&
        record.match.taskId === answer.taskId
          ? 'a'
          : record.match.b.contestantId === answer.contestantId &&
              record.match.taskId === answer.taskId
            ? 'b'
            : null;
      if (!side) return [];
      return record.votes.map((vote) => {
        const dims = vote.dimensions?.[side];
        const score = dims
          ? (meanOf(dims.adherence.map((line) => line.yesProbability)) ?? null)
          : null;
        return {
          callId: vote.callId,
          choice: vote.rawChoice,
          family: vote.judgeFamily,
          judgeRegistryKey: vote.vote.judgeModelId,
          model: vote.vote.judgeModelId,
          modelVersion: null,
          provider: null,
          rationale: vote.error ? null : vote.vote.rationale,
          score,
        };
      });
    });
    const answerAdherence = adherence.get(
      `${answer.taskId}|${answer.contestantId}`,
    );
    return {
      artifactRef: answer.ingredientId ? answer.answer.artifactUrl : null,
      brandFixtureId: task?.brandKey ?? 'none',
      callIds: [
        ...answer.callIds,
        ...votes.flatMap((vote) => (vote.callId ? [vote.callId] : [])),
      ],
      contentKind: `media-${section.medium}`,
      contestant: contestant
        ? {
            family: contestant.family,
            guidanceArm: contestant.route.kind === 'raw' ? 'raw' : 'brief',
            id: contestant.contestant.id,
            isCompiled: contestant.contestant.isCompiled,
            model: contestant.registryKey,
            modelVersion: null,
            provider: contestant.contestant.provider,
            registryKey: contestant.registryKey,
          }
        : null,
      costCredits: answer.costCredits,
      deterministicChecks: [
        {
          detail:
            answer.readiness.diagnostics.join('; ') ||
            (answer.readiness.platform
              ? `ready for ${answer.readiness.platform}`
              : answer.readiness.status),
          id: 'media-readiness',
          passed: answer.readiness.status === 'ready',
        },
      ],
      fixtureId: answer.taskId,
      fixtureVisibility:
        task?.visibility === 'private' ? 'private' : 'synthetic',
      humanLabel: null,
      isAccepted:
        answer.voidReason !== null
          ? false
          : answerAdherence === undefined
            ? null
            : answer.readiness.status === 'ready' &&
              answerAdherence >= ACCEPTED_ADHERENCE_THRESHOLD,
      latencyMs: answer.latencyMs,
      output: null,
      rubricVersion: MEDIA_RUBRIC_VERSION,
      runId,
      suite: 'media-ladder',
      voidReason: answer.voidReason
        ? `${answer.voidReason}${answer.voidDetail ? `: ${answer.voidDetail}` : ''}`
        : null,
      votes,
    };
  });
}

function toContestantSummaries(
  section: MediaLadderSection,
  rows: readonly ScoredRow[],
): ContestantSummary[] {
  return section.ladder.map((ladderRow) => {
    const own = rows.filter(
      (row) => row.contestant?.id === ladderRow.contestantId,
    );
    const latencies = own.map((row) => row.latencyMs);
    const scores = own.flatMap((row) =>
      row.votes.flatMap((vote) => (vote.score === null ? [] : [vote.score])),
    );
    return {
      acceptedCount: ladderRow.acceptedOutputs,
      contestantId: ladderRow.contestantId,
      creditsPerAcceptedOutput: ladderRow.costPerAcceptedOutput,
      deterministicPassRate:
        own.length === 0
          ? null
          : own.filter((row) => row.deterministicChecks.every((c) => c.passed))
              .length / own.length,
      latencyP50Ms: percentile(latencies, 0.5),
      latencyP95Ms: percentile(latencies, 0.95),
      meanScore: meanOf(scores),
      rows: own.length,
      spentCredits: ladderRow.costCredits,
      voidRate:
        own.length === 0
          ? 0
          : own.filter((row) => row.voidReason !== null).length / own.length,
      vsBaseline: null,
    };
  });
}

/**
 * Harness-level checks. A contestant that voids often is a finding shown on
 * the ladder, not a run failure; a panel whose judges fail, or a journal that
 * breaks the bench validate rules, is.
 */
function toThresholdChecks(section: MediaLadderSection): ThresholdCheck[] {
  const votes = section.matches.flatMap((record) => record.votes);
  const failed = votes.filter((vote) => vote.error !== null).length;
  const judgeFailureRate = votes.length === 0 ? null : failed / votes.length;
  const isJournalValid = section.matches.every(
    ({ match }) =>
      match.a.contestantId !== match.b.contestantId &&
      (match.state !== 'void' || match.ratingChange === null) &&
      (match.state !== 'recorded' ||
        (match.verdict !== null && match.votes.length >= 3)),
  );
  return [
    {
      actual: judgeFailureRate,
      comparator: '<=',
      id: 'media-judge-failure-rate',
      passed:
        judgeFailureRate === null ||
        judgeFailureRate <= CONTENT_EVAL_THRESHOLDS.maxVoidRate,
      subject: 'vision panel',
      threshold: CONTENT_EVAL_THRESHOLDS.maxVoidRate,
    },
    {
      actual: isJournalValid ? 1 : 0,
      comparator: '>=',
      id: 'media-bench-journal-valid',
      passed: isJournalValid,
      subject: 'bench validate rules',
      threshold: 1,
    },
  ];
}

export function toMediaSuiteOutcome(input: {
  section: MediaLadderSection;
  tasks: readonly MediaTask[];
  runId: string;
  schnellGrid: MediaReport['schnellGrid'];
  ratingSheetPath: string | null;
}): SuiteOutcome {
  const tasks = new Map(input.tasks.map((task) => [task.task.id, task]));
  const rows = toScoredRows(input.section, tasks, input.runId);
  const media: MediaReport = mediaReportSchema.parse({
    costNote: MEDIA_COST_NOTE,
    ladder: input.section,
    ratingSheetPath: input.ratingSheetPath,
    schnellGrid: input.schnellGrid,
  });
  return {
    benchMatches: input.section.matches.map((record) => record.match),
    contestants: toContestantSummaries(input.section, rows),
    judges: [],
    media,
    pairs: [],
    positionBiasRate: null,
    rows,
    thresholdChecks: toThresholdChecks(input.section),
  };
}

export function toHarnessContestants(contestants: readonly MediaContestant[]) {
  return contestants.map((entry) => ({
    guidanceArm:
      entry.route.kind === 'raw' ? ('raw' as const) : ('brief' as const),
    id: entry.contestant.id,
    isCompiled: entry.contestant.isCompiled,
    registryKey: entry.registryKey,
  }));
}
