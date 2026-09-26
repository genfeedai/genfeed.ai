import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { readFlag, UsageError } from '../cli';
import type {
  ContentEvalRunOptions,
  EvalDispatcher,
  EvalSpendLedger,
  SuiteContext,
  SuiteOutcome,
  SuitePreparation,
  SuiteRunner,
} from '../contracts';
import { contentEvalReportSchema } from '../contracts';
import {
  canonicalJson,
  meteredCall,
  resolveRepoPath,
  sha256Digest,
  toRepoRelativePath,
} from '../provenance';
import { buildMediaContestants, type RegistryMediaModel } from './contestants';
import {
  type BrandKit,
  type CalibrationStatus,
  type JudgeSpec,
  judgeVerdictSchema,
  MEDIA_RUBRIC_VERSION,
  type MediaContestant,
  type MediaTask,
  type Medium,
  type ReferenceRole,
  referenceRoleSchema,
} from './contracts';
import { resolveMediaModelFamily } from './families';
import { ProductApiMediaGeneration } from './generation';
import { FfmpegFrameSampler, type VisionJudgePort } from './judge';
import { buildPairRatingSheet, pairRatingSchema } from './rating-sheet';
import { FfprobeMediaProbe } from './readiness';
import { fetchRegistryMediaModels } from './registry';
import { toHarnessContestants, toMediaSuiteOutcome } from './report';
import {
  assertPanelsSeatable,
  type MediaLadderDeps,
  type MediaLadderOptions,
  type MediaSpendPort,
  runMediaLadder,
} from './run-media-ladder';
import {
  buildHumanAnchorSheet,
  buildSchnellGridTasks,
  SCHNELL_GRID_SEASON_ID,
  selectSchnellGridContestants,
  summarizeSchnellGrid,
} from './schnell-grid';
import {
  createMediaStubDispatcher,
  STUB_REGISTRY,
  StubFrameSampler,
  StubMediaGeneration,
  StubMediaProbe,
} from './stubs';
import {
  assertUniqueTaskIds,
  BENCH_TASK_PACK_DIR,
  buildGenerationBriefCorpusTasks,
  loadBenchTasks,
  loadKelderBrandKit,
  loadPrivateMediaTasks,
} from './tasks';

/**
 * `--suite=media-ladder` (#4926). Media-only flags, read from argv in
 * `prepare`:
 *
 *   --medium=image|video               default image
 *   --task-set=bench,corpus,private    or `schnell-grid` alone (#3470 re-score)
 *   --include-drafts=true              video: the 3 bench drafts (internal runs only)
 *   --genfeed-api-url=<url>            live: product API base (key from
 *                                      CONTENT_EVAL_GENFEED_API_KEY)
 *   --brands=kelder:<id>,aurora:<id>,neutral:<id>   eval-org brand ids
 *   --references=product-shot:<id>|<id>,character-sheet:<id>
 *   --harness-dir=<path>               genfeedai/harness checkout (private tasks)
 *   --compiled-fidelity=guided|strict  compiled route fidelity (default guided)
 *   --calibration-report=<path>        passing #4924 judge report → decision grade
 *   --anchors=<path>                   rated grid anchor sheet (JSON array)
 *   --rating-sheet-out=<path>          write the unrated pair sheet for humans
 *
 * Judges come from `--judge` (≥ 3 families); `--models` restricts contestants.
 */

const TASK_SETS = ['bench', 'corpus', 'private', 'schnell-grid'] as const;
type TaskSet = (typeof TASK_SETS)[number];

const JUDGE_MAX_TOKENS = 1_500;

interface MediaPlan {
  options: MediaLadderOptions;
  isGrid: boolean;
  apiUrl: string | null;
  apiKey: string | null;
  anchorsPath: string | null;
  ratingSheetPath: string | null;
}

function readList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readPairs(
  raw: string | undefined,
  flag: string,
): Array<[string, string]> {
  return readList(raw).map((entry) => {
    const at = entry.indexOf(':');
    if (at <= 0 || at === entry.length - 1) {
      throw new UsageError(`--${flag} entries are key:value, got "${entry}"`);
    }
    return [entry.slice(0, at), entry.slice(at + 1)];
  });
}

function readMedium(argv: string[]): Medium {
  const raw = readFlag(argv, 'medium') ?? 'image';
  if (raw !== 'image' && raw !== 'video') {
    throw new UsageError(`--medium must be image or video, got "${raw}"`);
  }
  return raw;
}

function readTaskSets(argv: string[]): TaskSet[] {
  const sets = readList(readFlag(argv, 'task-set') ?? 'bench');
  for (const set of sets) {
    if (!TASK_SETS.includes(set as TaskSet)) {
      throw new UsageError(
        `--task-set must be from ${TASK_SETS.join(', ')}, got "${set}"`,
      );
    }
  }
  if (sets.includes('schnell-grid') && sets.length > 1) {
    throw new UsageError('--task-set=schnell-grid runs alone');
  }
  return sets as TaskSet[];
}

function readReferences(
  argv: string[],
): Partial<Record<ReferenceRole, string[]>> {
  const references: Partial<Record<ReferenceRole, string[]>> = {};
  for (const [role, ids] of readPairs(
    readFlag(argv, 'references'),
    'references',
  )) {
    const parsed = referenceRoleSchema.safeParse(role);
    if (
      !parsed.success ||
      parsed.data === 'none' ||
      parsed.data === 'brand-kit'
    ) {
      throw new UsageError(
        `--references role "${role}" is not a supplied-asset role`,
      );
    }
    references[parsed.data] = ids.split('|').filter(Boolean);
  }
  return references;
}

function readCalibration(argv: string[]): CalibrationStatus {
  const path = readFlag(argv, 'calibration-report');
  if (!path) {
    return {
      isDecisionGrade: false,
      reason:
        'No vision-judge calibration report linked (#4924); the ranking is informational and must not drive a default.',
      reportRef: null,
    };
  }
  const report = contentEvalReportSchema.parse(
    JSON.parse(readFileSync(resolveRepoPath(path), 'utf8')),
  );
  const isPassingJudgeReport = report.suite === 'judge' && report.passed;
  return {
    isDecisionGrade: isPassingJudgeReport,
    reason: isPassingJudgeReport
      ? `Linked judge calibration report ${report.runId} passed its thresholds.`
      : `Linked report ${report.runId} is not a passing judge calibration report.`,
    reportRef: toRepoRelativePath(path),
  };
}

async function readLiveApiKey(): Promise<string> {
  const { ConfigService } = await import('@libs/config/config.service');
  const key = new ConfigService().get('CONTENT_EVAL_GENFEED_API_KEY')?.trim();
  if (!key) {
    throw new UsageError(
      'CONTENT_EVAL_GENFEED_API_KEY is not set: live media runs generate through the product API with an eval-organization key',
    );
  }
  return key;
}

async function loadTasks(
  argv: string[],
  medium: Medium,
  sets: readonly TaskSet[],
): Promise<MediaTask[]> {
  const includeDrafts = readFlag(argv, 'include-drafts') === 'true';
  const tasks: MediaTask[] = [];
  for (const set of sets) {
    if (set === 'bench') {
      tasks.push(...(await loadBenchTasks({ includeDrafts, medium })));
    } else if (set === 'corpus') {
      tasks.push(...buildGenerationBriefCorpusTasks(medium));
    } else if (set === 'private') {
      const harnessDir = readFlag(argv, 'harness-dir');
      if (!harnessDir) {
        throw new UsageError('--task-set=private needs --harness-dir');
      }
      tasks.push(
        ...(await loadPrivateMediaTasks(resolveRepoPath(harnessDir), {
          includeDrafts,
          medium,
        })),
      );
    } else {
      if (medium !== 'image') {
        throw new UsageError('--task-set=schnell-grid is an image grid');
      }
      tasks.push(...buildSchnellGridTasks());
    }
  }
  assertUniqueTaskIds(tasks);
  if (tasks.length === 0) throw new UsageError('No media tasks selected');
  return tasks;
}

function fixtureFor(tasks: readonly MediaTask[], sets: readonly TaskSet[]) {
  return {
    // Private task content is digested, never named, in the report.
    digest: sha256Digest(canonicalJson(tasks.map((entry) => entry.task))),
    path: sets.includes('bench')
      ? toRepoRelativePath(BENCH_TASK_PACK_DIR)
      : `media:${sets.join('+')}`,
    rows: [],
  };
}

function buildJudgePort(
  dispatcher: EvalDispatcher,
  ledger: EvalSpendLedger,
  rubricDigestFor: (rowId: string) => string,
): VisionJudgePort {
  return {
    async judge(request) {
      const { provenance, response } = await meteredCall(
        {
          dispatcher,
          ledger,
          rowId: request.rowId,
          rubricDigest: rubricDigestFor(request.rowId),
          rubricVersion: MEDIA_RUBRIC_VERSION,
        },
        {
          maxTokens: JUDGE_MAX_TOKENS,
          messages: request.messages,
          model: request.judge.modelId,
          role: 'judge',
          schema: judgeVerdictSchema,
          schemaName: request.schemaName,
          seed: 0,
          temperature: 0,
        },
      );
      return {
        callId: provenance.callId,
        costUsd: provenance.costUsd,
        latencyMs: Math.round(response.latencyMs),
        verdict: response.value,
      };
    },
  };
}

function buildSpendPort(ledger: EvalSpendLedger): MediaSpendPort {
  return {
    chargeGeneration(input) {
      const callId = `call-${ledger.calls.length + 1}-generation`;
      const route = input.contestant.route;
      ledger.charge({
        credits: input.credits,
        kind: 'generation',
        provenance: {
          callId,
          capabilityProfileVersion:
            route.kind === 'compiled'
              ? `${route.profileId}@${route.profileVersion}`
              : null,
          completionTokens: 0,
          compilerVersion:
            route.kind === 'compiled'
              ? `${route.compilerId}@${route.compilerVersion}`
              : null,
          costEvidence: 'retail-credits',
          costUsd: input.credits * 0.01,
          credits: input.credits,
          family: input.contestant.family,
          isFailed: false,
          kind: 'generation',
          latencyMs: 0,
          model: input.contestant.registryKey,
          modelVersion: input.contestant.registryKey,
          promptDigest: `sha256:${input.promptDigest}`,
          promptTokens: 0,
          provider: 'genfeed-product-api',
          rowId: input.contestant.contestant.id,
          rubricDigest: null,
          rubricVersion: null,
          seed: input.seed ?? 0,
          settings: input.settings,
        },
      });
      return callId;
    },
    reserveGeneration(credits) {
      ledger.reserve(credits);
    },
  };
}

function writeJson(path: string, value: unknown): string {
  const absolute = resolveRepoPath(path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`);
  return toRepoRelativePath(path);
}

export function createMediaLadderSuite(): SuiteRunner {
  let plan: MediaPlan | null = null;

  return {
    async prepare(options: ContentEvalRunOptions): Promise<SuitePreparation> {
      const argv = options.argv ?? [];
      const medium = readMedium(argv);
      const sets = readTaskSets(argv);
      const isGrid = sets.includes('schnell-grid');
      const isLive = options.dispatcherKind === 'live';
      const apiUrl = readFlag(argv, 'genfeed-api-url') ?? null;
      if (isLive && !apiUrl) {
        throw new UsageError(
          '--genfeed-api-url is required for a live media run (the product API the eval organization generates through)',
        );
      }
      const apiKey = isLive ? await readLiveApiKey() : null;

      const registry: RegistryMediaModel[] =
        isLive && apiUrl && apiKey
          ? await fetchRegistryMediaModels({ apiKey, apiUrl, medium })
          : STUB_REGISTRY[medium];
      const fidelity = readFlag(argv, 'compiled-fidelity') ?? 'guided';
      if (fidelity !== 'guided' && fidelity !== 'strict') {
        throw new UsageError('--compiled-fidelity must be guided or strict');
      }
      const all = buildMediaContestants({
        addedAt: (options.now ?? new Date()).toISOString(),
        compiledFidelity: fidelity,
        medium,
        models: registry,
        onlyKeys: options.models,
      });
      const contestants: MediaContestant[] = isGrid
        ? Object.values(selectSchnellGridContestants(all))
        : all;
      if (contestants.length < 2) {
        throw new UsageError('A media ladder needs at least two contestants');
      }

      const judges: JudgeSpec[] = options.judgeRegistryKeys.map((modelId) => ({
        family: resolveMediaModelFamily(modelId),
        modelId,
      }));
      assertPanelsSeatable(contestants, judges);

      const tasks = await loadTasks(argv, medium, sets);
      const kit: BrandKit = await loadKelderBrandKit();
      const brandIds = Object.fromEntries(
        readPairs(readFlag(argv, 'brands'), 'brands'),
      );
      if (!isLive) {
        for (const key of ['kelder', 'aurora', 'neutral']) {
          brandIds[key] ??= `stub-brand-${key}`;
        }
      }

      plan = {
        anchorsPath: readFlag(argv, 'anchors') ?? null,
        apiKey,
        apiUrl,
        isGrid,
        options: {
          brandIds,
          calibration: readCalibration(argv),
          contestants,
          judges,
          kit,
          medium,
          references: readReferences(argv),
          seasonId: isGrid ? SCHNELL_GRID_SEASON_ID : `internal-${medium}`,
          seed: options.seed,
          tasks,
        },
        ratingSheetPath: readFlag(argv, 'rating-sheet-out') ?? null,
      };

      return {
        contestants: toHarnessContestants(contestants),
        crossFamily: 'per-match',
        fixture: fixtureFor(tasks, sets),
      };
    },

    async run(
      context: SuiteContext,
      onProgress: (outcome: SuiteOutcome) => void,
    ): Promise<SuiteOutcome> {
      if (!plan) throw new Error('media-ladder ran without prepare()');
      const current = plan;
      const isStub = context.dispatcher.kind === 'stub';
      const dispatcher = isStub
        ? createMediaStubDispatcher()
        : context.dispatcher;
      const rubricDigests = new Map(
        current.options.tasks.map((task) => [
          task.task.id,
          sha256Digest(canonicalJson(task.task.rubric)),
        ]),
      );
      const deps: MediaLadderDeps = {
        frames: isStub ? new StubFrameSampler() : new FfmpegFrameSampler(),
        generation:
          isStub || !current.apiUrl || !current.apiKey
            ? new StubMediaGeneration()
            : new ProductApiMediaGeneration({
                apiKey: current.apiKey,
                apiUrl: current.apiUrl,
              }),
        judge: buildJudgePort(dispatcher, context.ledger, (rowId) => {
          const taskId = rowId.split(':')[1] ?? '';
          return (
            rubricDigests.get(taskId) ?? sha256Digest(MEDIA_RUBRIC_VERSION)
          );
        }),
        now: () => new Date(),
        probe: isStub ? new StubMediaProbe() : new FfprobeMediaProbe(),
        spend: buildSpendPort(context.ledger),
      };

      const outcomeOf = (
        section: Parameters<typeof toMediaSuiteOutcome>[0]['section'],
      ): SuiteOutcome => {
        const grid = current.isGrid
          ? selectSchnellGridContestants(current.options.contestants)
          : null;
        const anchors = current.anchorsPath
          ? pairRatingSchema
              .array()
              .parse(
                JSON.parse(
                  readFileSync(resolveRepoPath(current.anchorsPath), 'utf8'),
                ),
              )
          : [];
        const ratingSheetPath = current.ratingSheetPath
          ? writeJson(
              current.ratingSheetPath,
              current.isGrid
                ? buildHumanAnchorSheet(section)
                : buildPairRatingSheet(section),
            )
          : null;
        return toMediaSuiteOutcome({
          ratingSheetPath,
          runId: context.runId,
          schnellGrid: grid
            ? summarizeSchnellGrid(section, grid.legacy, grid.compiled, anchors)
            : null,
          section,
          tasks: current.options.tasks,
        });
      };

      const section = await runMediaLadder(
        deps,
        current.options,
        new AbortController().signal,
        (partial) => onProgress(outcomeOf(partial)),
      );
      return outcomeOf(section);
    },
    suite: 'media-ladder',
  };
}

export const mediaLadderSuite = createMediaLadderSuite();
