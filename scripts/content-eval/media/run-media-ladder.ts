import { createHash } from 'node:crypto';
import type { Match } from '../bench/schema';
import { matchSchema } from '../bench/schema';
import {
  type AnswerVoidReason,
  type BrandKit,
  type CalibrationStatus,
  type JudgeSpec,
  type LadderRow,
  MEDIA_LADDER_SCHEMA_VERSION,
  MEDIA_RUBRIC_VERSION,
  type MediaAnswerRecord,
  type MediaContestant,
  type MediaLadderSection,
  type MediaMatchRecord,
  type MediaTask,
  type MediaVoteRecord,
  type Medium,
  mediaLadderSectionSchema,
  type ReadinessResult,
  type ReferenceRole,
  type TaskWinRate,
} from './contracts';
import { recomputeElo } from './elo';
import type { MediaGenerationPort } from './generation';
import {
  assertVerdictCoversRubric,
  buildJudgeMessages,
  type FrameSamplerPort,
  JUDGE_SCHEMA_NAME,
  meanAdherence,
  type VisionJudgePort,
} from './judge';
import {
  deriveMatchSeed,
  hasFullPanel,
  type PanelChoice,
  resolvePanelVerdict,
  selectEligibleJudges,
  shouldSwapPositions,
} from './panel';
import { assessReadiness, type MediaProbePort } from './readiness';
import { BENCH_TASK_PACK_REVISION, renderBrandKit } from './tasks';

/**
 * The media ladder (#4926): every contestant answers every runnable task once
 * through the product API, readiness gates each answer, each task plays a
 * round robin of pairs in front of a ≥3-judge cross-family panel, and the bench
 * Elo turns recorded verdicts into a ladder. Voids are counted, never rated.
 */

/** An answer counts as accepted when it is ready and judges rate its adherence at least this high. */
export const ACCEPTED_ADHERENCE_THRESHOLD = 0.6;

/** Long side in pixels requested from every contestant. */
export const OUTPUT_LONG_SIDE = 1536;

export class InsufficientJudgePanelError extends Error {
  constructor(readonly pairs: readonly string[]) {
    super(
      `Fewer than 3 eligible cross-family judges for: ${pairs.join('; ')}. Add judges from other families before any spend.`,
    );
    this.name = 'InsufficientJudgePanelError';
  }
}

/** Metering hooks the suite adapter wires to the harness SpendLedger. */
export interface MediaSpendPort {
  reserveGeneration(credits: number): void;
  chargeGeneration(input: {
    credits: number;
    costEvidence: 'reported' | 'estimated';
    contestant: MediaContestant;
    promptDigest: string;
    seed: number | null;
    settings: Record<string, string | number | boolean>;
  }): string;
}

export interface MediaLadderDeps {
  generation: MediaGenerationPort;
  probe: MediaProbePort;
  frames: FrameSamplerPort;
  judge: VisionJudgePort;
  spend: MediaSpendPort;
  now: () => Date;
}

export interface MediaLadderOptions {
  medium: Medium;
  seasonId: string;
  seed: number;
  tasks: readonly MediaTask[];
  contestants: readonly MediaContestant[];
  judges: readonly JudgeSpec[];
  kit: BrandKit;
  /** brandKey → eval-org brand id; `neutral` serves tasks without a brand. */
  brandIds: Readonly<Record<string, string>>;
  /** Reference role → eval-org ingredient ids supplied to the task. */
  references: Readonly<Partial<Record<ReferenceRole, readonly string[]>>>;
  calibration: CalibrationStatus;
}

export const NEUTRAL_BRAND_KEY = 'neutral';

interface PlannedTask {
  mediaTask: MediaTask;
  skippedReason: string | null;
}

interface AnswerState {
  record: MediaAnswerRecord;
  fetchUrls: string[];
}

export function isSpendCapError(error: unknown): boolean {
  return error instanceof Error && error.name === 'SpendCapExceededError';
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function outputDimensions(aspectRatio: string): {
  width: number;
  height: number;
} {
  const [w, h] = aspectRatio.split(':').map(Number);
  if (!w || !h) return { height: OUTPUT_LONG_SIDE, width: OUTPUT_LONG_SIDE };
  const round16 = (value: number) => Math.max(16, Math.round(value / 16) * 16);
  return w >= h
    ? { height: round16((OUTPUT_LONG_SIDE * h) / w), width: OUTPUT_LONG_SIDE }
    : { height: OUTPUT_LONG_SIDE, width: round16((OUTPUT_LONG_SIDE * w) / h) };
}

export function answerArtifactRef(ingredientId: string | null): string {
  return ingredientId
    ? `genfeed-ingredient://${ingredientId}`
    : 'genfeed-ingredient://none';
}

export function matchIdFor(
  seasonId: string,
  taskId: string,
  first: string,
  second: string,
): string {
  return `${seasonId}:${taskId}:${first}~${second}`;
}

/** Seed shared by every contestant for a task output, so limits are identical. */
export function taskOutputSeed(
  runSeed: number,
  taskId: string,
  index: number,
): number {
  return deriveMatchSeed(runSeed, `${taskId}#${index}`) % 2_147_483_647;
}

export function planTasks(
  tasks: readonly MediaTask[],
  options: Pick<MediaLadderOptions, 'brandIds' | 'references'>,
): PlannedTask[] {
  return tasks.map((mediaTask) => {
    const missingRoles = mediaTask.task.referenceRoles.filter(
      (role) =>
        role !== 'none' &&
        role !== 'brand-kit' &&
        (options.references[role]?.length ?? 0) === 0,
    );
    if (missingRoles.length > 0) {
      return {
        mediaTask,
        skippedReason: `reference not supplied: ${missingRoles.join(', ')}`,
      };
    }
    const brandKey = mediaTask.brandKey ?? NEUTRAL_BRAND_KEY;
    if (!options.brandIds[brandKey]) {
      return { mediaTask, skippedReason: `no eval brand for "${brandKey}"` };
    }
    return { mediaTask, skippedReason: null };
  });
}

export function planPairs(
  contestants: readonly MediaContestant[],
): Array<[MediaContestant, MediaContestant]> {
  const pairs: Array<[MediaContestant, MediaContestant]> = [];
  for (let i = 0; i < contestants.length; i += 1) {
    for (let j = i + 1; j < contestants.length; j += 1) {
      pairs.push([contestants[i], contestants[j]]);
    }
  }
  return pairs;
}

/** Fails before any spend when a pair cannot seat a full cross-family panel. */
export function assertPanelsSeatable(
  contestants: readonly MediaContestant[],
  judges: readonly JudgeSpec[],
): void {
  const short = planPairs(contestants)
    .filter(
      ([one, two]) =>
        !hasFullPanel(selectEligibleJudges(judges, [one.family, two.family])),
    )
    .map(([one, two]) => `${one.contestant.id} vs ${two.contestant.id}`);
  if (short.length > 0) throw new InsufficientJudgePanelError(short);
}

function taskPrompt(mediaTask: MediaTask, kit: BrandKit): string {
  return mediaTask.task.referenceRoles.includes('brand-kit')
    ? `${mediaTask.task.prompt}\n\n${renderBrandKit(kit)}`
    : mediaTask.task.prompt;
}

async function generateAnswer(
  deps: MediaLadderDeps,
  options: MediaLadderOptions,
  mediaTask: MediaTask,
  contestant: MediaContestant,
  signal: AbortSignal,
): Promise<AnswerState> {
  const { task } = mediaTask;
  const prompt = taskPrompt(mediaTask, options.kit);
  const promptDigest = sha256(prompt);
  const { width, height } = outputDimensions(task.outputSpec.aspectRatio);
  const brandId =
    options.brandIds[mediaTask.brandKey ?? NEUTRAL_BRAND_KEY] ?? '';
  const referenceIngredientIds = task.referenceRoles.flatMap(
    (role) => options.references[role] ?? [],
  );

  const ingredientIds: string[] = [];
  const fetchUrls: string[] = [];
  let costCredits = 0;
  let latencyMs = 0;
  let voidReason: AnswerVoidReason | null = null;
  let voidDetail: string | null = null;
  let readiness: ReadinessResult = {
    diagnostics: [],
    platform: null,
    status: 'unprobed',
  };
  let settings: Record<string, string | number | boolean> = {};
  const callIds: string[] = [];
  const seedFor = (index: number) =>
    mediaTask.fixedSeed === null
      ? taskOutputSeed(options.seed, task.id, index)
      : mediaTask.fixedSeed + index;
  const firstSeed = seedFor(0);

  for (let index = 0; index < task.outputSpec.count; index += 1) {
    const seed = seedFor(index);
    deps.spend.reserveGeneration(contestant.creditsPerOutput);
    const result = await deps.generation.generate(
      {
        brandId,
        compiledFidelity: mediaTask.compiledFidelity,
        contestant,
        durationSeconds: task.outputSpec.durationSeconds ?? null,
        height,
        medium: task.medium,
        prompt,
        referenceIngredientIds,
        seed,
        style: mediaTask.style,
        width,
      },
      signal,
    );
    const callId = deps.spend.chargeGeneration({
      contestant,
      costEvidence: result.costEvidence,
      credits: result.creditsCharged,
      promptDigest,
      seed,
      settings: result.settings,
    });
    callIds.push(callId);
    costCredits += result.creditsCharged;
    latencyMs += result.latencyMs;
    settings = result.settings;
    if (result.status !== 'generated' || !result.fetchUrl) {
      voidReason =
        result.status === 'refused' ? 'provider-refused' : 'generation-failed';
      voidDetail = result.error;
      break;
    }
    if (result.ingredientId) ingredientIds.push(result.ingredientId);
    fetchUrls.push(result.fetchUrl);

    try {
      const probe = await deps.probe.probe(
        result.fetchUrl,
        task.medium,
        signal,
      );
      readiness = assessReadiness(
        task,
        probe,
        result.ingredientId ?? `${contestant.contestant.id}#${index}`,
      );
    } catch (error: unknown) {
      if (signal.aborted) throw error;
      readiness = {
        diagnostics: [
          `probe failed: ${error instanceof Error ? error.message : String(error)}`,
        ],
        platform: null,
        status: 'blocked',
      };
    }
    if (readiness.status === 'blocked') {
      voidReason = 'readiness-blocked';
      voidDetail = readiness.diagnostics.join('; ');
      break;
    }
  }

  return {
    fetchUrls,
    record: {
      answer: {
        artifactUrl: answerArtifactRef(ingredientIds[0] ?? null),
        contestantId: contestant.contestant.id,
        seed: firstSeed,
        settings: {
          ...settings,
          ...(ingredientIds.length > 1
            ? { ingredientIds: ingredientIds.join(',') }
            : {}),
          outputs: task.outputSpec.count,
          promptDigest,
        },
      },
      callIds,
      contestantId: contestant.contestant.id,
      costCredits,
      ingredientId: ingredientIds[0] ?? null,
      latencyMs,
      readiness,
      requestPromptDigest: promptDigest,
      taskId: task.id,
      voidDetail,
      voidReason,
    },
  };
}

async function judgePair(
  deps: MediaLadderDeps,
  options: MediaLadderOptions,
  mediaTask: MediaTask,
  shownA: AnswerState,
  shownB: AnswerState,
  judges: readonly JudgeSpec[],
  matchId: string,
  signal: AbortSignal,
): Promise<MediaVoteRecord[]> {
  const sampleAll = async (answer: AnswerState) =>
    (
      await Promise.all(
        answer.fetchUrls.map((url) =>
          deps.frames.sample(url, mediaTask.task.medium, signal),
        ),
      )
    ).flat();
  const messages = buildJudgeMessages({
    a: { frames: await sampleAll(shownA) },
    b: { frames: await sampleAll(shownB) },
    kit: options.kit,
    task: mediaTask,
  });

  const votes: MediaVoteRecord[] = [];
  for (const judge of judges) {
    try {
      const response = await deps.judge.judge(
        {
          judge,
          messages,
          rowId: matchId,
          rubricLines: mediaTask.task.rubric.length,
          schemaName: JUDGE_SCHEMA_NAME,
        },
        signal,
      );
      const verdict = assertVerdictCoversRubric(
        response.verdict,
        mediaTask.task.rubric.length,
      );
      votes.push({
        callId: response.callId,
        costUsd: response.costUsd,
        dimensions: { a: verdict.a, b: verdict.b },
        error: null,
        judgeFamily: judge.family,
        latencyMs: response.latencyMs,
        rawChoice: verdict.choice,
        vote: {
          choice: verdict.choice === 'tie' ? 'void' : verdict.choice,
          judgeModelId: judge.modelId,
          rationale: verdict.rationale,
        },
      });
    } catch (error: unknown) {
      if (isSpendCapError(error) || signal.aborted) throw error;
      const message = error instanceof Error ? error.message : String(error);
      votes.push({
        callId: null,
        costUsd: null,
        dimensions: null,
        error: message,
        judgeFamily: judge.family,
        latencyMs: 0,
        rawChoice: null,
        vote: {
          choice: 'void',
          judgeModelId: judge.modelId,
          rationale: `judge call failed: ${message}`,
        },
      });
    }
  }
  return votes;
}

/**
 * Runs the ladder. `onProgress` receives the section after every task, so a
 * spend-cap abort still leaves a reportable partial ladder; the cap error is
 * then rethrown for the harness to mark the report `aborted: spend`.
 */
export async function runMediaLadder(
  deps: MediaLadderDeps,
  options: MediaLadderOptions,
  signal: AbortSignal,
  onProgress: (section: MediaLadderSection) => void = () => undefined,
): Promise<MediaLadderSection> {
  const planned = planTasks(options.tasks, options);
  const runnable = planned.filter((entry) => entry.skippedReason === null);
  assertPanelsSeatable(options.contestants, options.judges);

  const answers: MediaAnswerRecord[] = [];
  const matchRecords: MediaMatchRecord[] = [];
  const snapshot = (isAborted: boolean) =>
    buildSection(options, planned, answers, matchRecords, isAborted);

  try {
    for (const { mediaTask } of runnable) {
      const byContestant = new Map<string, AnswerState>();
      for (const contestant of options.contestants) {
        const state = await generateAnswer(
          deps,
          options,
          mediaTask,
          contestant,
          signal,
        );
        byContestant.set(contestant.contestant.id, state);
        answers.push(state.record);
      }

      for (const [one, two] of planPairs(options.contestants)) {
        const matchId = matchIdFor(
          options.seasonId,
          mediaTask.task.id,
          one.contestant.id,
          two.contestant.id,
        );
        const isSwapped = shouldSwapPositions(options.seed, matchId);
        const [shownA, shownB] = isSwapped ? [two, one] : [one, two];
        const stateA = byContestant.get(shownA.contestant.id);
        const stateB = byContestant.get(shownB.contestant.id);
        if (!stateA || !stateB) continue;

        const base = {
          a: stateA.record.answer,
          b: stateB.record.answer,
          id: matchId,
          ratingChange: null,
          seasonId: options.seasonId,
          taskId: mediaTask.task.id,
          taskVersion: mediaTask.task.version,
        };

        if (stateA.record.voidReason || stateB.record.voidReason) {
          matchRecords.push({
            match: matchSchema.parse({
              ...base,
              recordedAt: null,
              state: 'void',
              verdict: 'void',
              votes: [],
            }),
            medium: options.medium,
            voidDetail: [stateA, stateB]
              .filter((state) => state.record.voidReason)
              .map(
                (state) =>
                  `${state.record.contestantId}: ${state.record.voidReason}`,
              )
              .join('; '),
            voidReason: 'answer-void',
            votes: [],
          });
          continue;
        }

        const judges = selectEligibleJudges(options.judges, [
          one.family,
          two.family,
        ]);
        const votes = await judgePair(
          deps,
          options,
          mediaTask,
          stateA,
          stateB,
          judges,
          matchId,
          signal,
        );
        const panel = resolvePanelVerdict(
          votes.map((vote) => vote.vote.choice as PanelChoice),
        );
        const isRecorded = panel.verdict !== 'void';
        matchRecords.push({
          match: matchSchema.parse({
            ...base,
            recordedAt: isRecorded ? deps.now().toISOString() : null,
            state: isRecorded ? 'recorded' : 'void',
            verdict: panel.verdict,
            votes: votes.map((vote) => vote.vote),
          }),
          medium: options.medium,
          voidDetail: isRecorded
            ? null
            : `panel a=${panel.aVotes} b=${panel.bVotes} void=${panel.voidVotes}`,
          voidReason: isRecorded ? null : 'panel-tie',
          votes,
        });
      }
      onProgress(snapshot(false));
    }
  } catch (error: unknown) {
    if (isSpendCapError(error)) onProgress(snapshot(true));
    throw error;
  }

  return snapshot(false);
}

function buildSection(
  options: MediaLadderOptions,
  planned: readonly PlannedTask[],
  answers: readonly MediaAnswerRecord[],
  matchRecords: readonly MediaMatchRecord[],
  isAborted: boolean,
): MediaLadderSection {
  const elo = recomputeElo(
    matchRecords.map((record) => record.match),
    options.contestants.map((contestant) => contestant.contestant.id),
  );
  const changes = new Map(
    elo.outcomes.map((outcome) => [outcome.matchId, outcome.ratingChange]),
  );
  const matches = matchRecords.map((record) => ({
    ...record,
    match: matchSchema.parse({
      ...record.match,
      ratingChange: changes.get(record.match.id) ?? null,
    }),
  }));

  return mediaLadderSectionSchema.parse({
    answers,
    benchRevision: BENCH_TASK_PACK_REVISION,
    calibration: options.calibration,
    contestants: options.contestants,
    isAborted,
    isPublicLadderEligible: false,
    judges: options.judges,
    ladder: buildLadderRows(elo.standings, answers, matches),
    matches,
    medium: options.medium,
    rubricVersion: MEDIA_RUBRIC_VERSION,
    schemaVersion: MEDIA_LADDER_SCHEMA_VERSION,
    seasonId: options.seasonId,
    seed: options.seed,
    taskWinRates: buildTaskWinRates(
      matches.map((record) => record.match),
      options.contestants,
    ),
    tasks: planned.map(({ mediaTask, skippedReason }) => ({
      id: mediaTask.task.id,
      skippedReason,
      source: mediaTask.source,
      version: mediaTask.task.version,
      visibility: mediaTask.visibility,
    })),
    technicalDims: {
      reason:
        'VBench custom_input dims need a CUDA fleet runtime; not run (GPU instances stay off).',
      source: 'absent',
    },
  });
}

/**
 * Judge-mean adherence per answer, over every vote cast on it. An answer is
 * accepted when it is ready and that mean clears the threshold.
 */
export function collectAnswerAdherence(
  matches: readonly MediaMatchRecord[],
): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>();
  const add = (key: string, value: number) => {
    const entry = sums.get(key) ?? { count: 0, total: 0 };
    entry.total += value;
    entry.count += 1;
    sums.set(key, entry);
  };
  for (const record of matches) {
    for (const vote of record.votes) {
      if (!vote.dimensions) continue;
      const verdict = {
        a: vote.dimensions.a,
        b: vote.dimensions.b,
        choice: 'tie' as const,
        rationale: '-',
      };
      add(
        `${record.match.taskId}|${record.match.a.contestantId}`,
        meanAdherence(verdict, 'a'),
      );
      add(
        `${record.match.taskId}|${record.match.b.contestantId}`,
        meanAdherence(verdict, 'b'),
      );
    }
  }
  return new Map(
    [...sums.entries()].map(([key, { total, count }]) => [key, total / count]),
  );
}

function buildLadderRows(
  standings: ReturnType<typeof recomputeElo>['standings'],
  answers: readonly MediaAnswerRecord[],
  matches: readonly MediaMatchRecord[],
): LadderRow[] {
  const adherence = collectAnswerAdherence(matches);
  return standings.map((standing, index) => {
    const own = answers.filter(
      (answer) => answer.contestantId === standing.contestantId,
    );
    const costCredits = own.reduce(
      (sum, answer) => sum + answer.costCredits,
      0,
    );
    const acceptedOutputs = own.filter(
      (answer) =>
        answer.voidReason === null &&
        answer.readiness.status === 'ready' &&
        (adherence.get(`${answer.taskId}|${answer.contestantId}`) ?? 0) >=
          ACCEPTED_ADHERENCE_THRESHOLD,
    ).length;
    const played = standing.matches + standing.voids;
    return {
      acceptedOutputs,
      contestantId: standing.contestantId,
      costCredits,
      costPerAcceptedOutput:
        acceptedOutputs > 0 ? costCredits / acceptedOutputs : null,
      losses: standing.losses,
      matches: standing.matches,
      rank: index + 1,
      rating: standing.rating,
      voidRate: played > 0 ? standing.voids / played : 0,
      voids: standing.voids,
      wins: standing.wins,
    };
  });
}

export function buildTaskWinRates(
  matches: readonly Match[],
  contestants: readonly MediaContestant[],
): TaskWinRate[] {
  const taskIds = [...new Set(matches.map((match) => match.taskId))].sort();
  const rows: TaskWinRate[] = [];
  for (const taskId of taskIds) {
    const decided = matches.filter(
      (match) => match.taskId === taskId && match.state === 'recorded',
    );
    for (const { contestant } of contestants) {
      const played = decided.filter(
        (match) =>
          match.a.contestantId === contestant.id ||
          match.b.contestantId === contestant.id,
      );
      const wins = played.filter(
        (match) =>
          (match.verdict === 'a' && match.a.contestantId === contestant.id) ||
          (match.verdict === 'b' && match.b.contestantId === contestant.id),
      ).length;
      rows.push({
        contestantId: contestant.id,
        decided: played.length,
        taskId,
        winRate: played.length > 0 ? wins / played.length : null,
        wins,
      });
    }
  }
  return rows;
}
