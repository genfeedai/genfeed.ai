/**
 * Content-eval harness contracts (#4922, epic #4921).
 *
 * Every shape a run reads or writes lives here: fixture rows, the resolved
 * suite config, thresholds, the dispatcher port, per-call provenance and the
 * report. Media match records reuse the public bench schema pinned in
 * `./bench/schema.ts`; sibling phases (#4923 golden set, #4924 calibration,
 * #4925/#4926 ladders, #5234 outliers) extend the report through the optional
 * sections below rather than reshaping it.
 */

import type { ZodType } from 'zod';
import { z } from 'zod';
import { matchSchema } from './bench/schema';

export const CONTENT_EVAL_REPORT_SCHEMA_VERSION = 1;

export const SUITE_NAMES = [
  'judge',
  'ladder',
  'harness-ab',
  'media-ladder',
] as const;
export type SuiteName = (typeof SUITE_NAMES)[number];

export const DISPATCHER_KINDS = ['stub', 'live'] as const;
export type DispatcherKind = (typeof DISPATCHER_KINDS)[number];

export const CALL_ROLES = ['generation', 'judge'] as const;
export type CallRole = (typeof CALL_ROLES)[number];

export const FIXTURE_VISIBILITIES = ['synthetic', 'private'] as const;
export type FixtureVisibility = (typeof FIXTURE_VISIBILITIES)[number];

export const PAIRWISE_CHOICES = ['a', 'b', 'tie'] as const;
export type PairwiseChoice = (typeof PAIRWISE_CHOICES)[number];

export const ABORT_REASONS = ['spend'] as const;
export type AbortReason = (typeof ABORT_REASONS)[number];

// ─── Thresholds ─────────────────────────────────────────────────────────────

/**
 * Pass/fail gates. Changed only in a PR that links the report justifying the
 * new value (#4921 FR 8); the version is written into every report.
 */
export const CONTENT_EVAL_THRESHOLDS = {
  version: 'thresholds-v1',
  /** A generated output is "accepted" at or above this judge score (0–1). */
  acceptedMinScore: 0.6,
  /** Judge suite: share of rows whose judge score lands in the human band. */
  judgeMinBandAgreement: 0.6,
  /** Pairwise suites: share of pairs whose verdict flips with the ordering. */
  maxPositionBiasRate: 0.05,
  /** Pairwise suites: generation or judge failures per contestant. */
  maxVoidRate: 0.2,
  /** Pairwise suites: default |scoreA − scoreB| that still counts as a tie. */
  pointwiseTieBand: 0.05,
} as const;

export type ContentEvalThresholds = typeof CONTENT_EVAL_THRESHOLDS;

// ─── Fixtures ───────────────────────────────────────────────────────────────

/** A 0–1 band. Human 0–100 reviewer scores are divided by 100 on export. */
export const scoreBandSchema = z
  .object({ max: z.number().min(0).max(1), min: z.number().min(0).max(1) })
  .refine((band) => band.min <= band.max, 'band.min must be <= band.max');
export type ScoreBand = z.infer<typeof scoreBandSchema>;

export const humanDecisionSchema = z.enum(['approve', 'reject']);
export type HumanDecision = z.infer<typeof humanDecisionSchema>;

/** Deterministic brief rules applied to a generated or judged text. */
export const contentBriefSchema = z.object({
  bannedPhrases: z.array(z.string().min(1)).default([]),
  guidance: z.string().optional(),
  hashtagRange: z
    .object({ max: z.number().int().nonnegative(), min: z.number().int() })
    .optional(),
  isCtaRequired: z.boolean().default(false),
  linkRange: z
    .object({ max: z.number().int().nonnegative(), min: z.number().int() })
    .optional(),
  maxCharacters: z.number().int().positive().optional(),
  minCharacters: z.number().int().nonnegative().optional(),
  /** Structured kinds (carousels, threads as JSON): output must match this. */
  outputJsonSchema: z.record(z.string(), z.unknown()).optional(),
});
export type ContentBrief = z.infer<typeof contentBriefSchema>;

export const fixtureInputSchema = z.object({
  brief: contentBriefSchema.default({
    bannedPhrases: [],
    isCtaRequired: false,
  }),
  /** Judge suite: the already-produced text being scored. */
  output: z.string().min(1).optional(),
  platform: z.string().min(1).optional(),
  prompt: z.string().min(1),
});
export type FixtureInput = z.infer<typeof fixtureInputSchema>;

export const fixtureSourceSchema = z.object({
  /** Anonymised pointer to where the label came from; never a tenant id. */
  reference: z.string().min(1),
  visibility: z.enum(FIXTURE_VISIBILITIES),
});

export const fixtureRowSchema = z.object({
  brandFixtureId: z.string().min(1),
  contentKind: z.string().regex(/^[a-z0-9-]+$/),
  expected: z
    .object({
      decision: humanDecisionSchema.optional(),
      scoreBand: scoreBandSchema.optional(),
    })
    .default({}),
  id: z.string().min(1),
  input: fixtureInputSchema,
  rubricVersion: z.string().min(1),
  source: fixtureSourceSchema,
});
export type FixtureRow = z.infer<typeof fixtureRowSchema>;

// ─── Suite config ───────────────────────────────────────────────────────────

export const contestantSchema = z.object({
  /** Stable id within a run, e.g. `openai/gpt-5.6-luna` or `…#brief`. */
  id: z.string().min(1),
  /** Guidance arm for harness A/B; `raw` sends the prompt alone. */
  guidanceArm: z.enum(['raw', 'brief']),
  isCompiled: z.boolean().default(false),
  registryKey: z.string().min(1),
});
export type Contestant = z.infer<typeof contestantSchema>;

export const suiteConfigSchema = z.object({
  contestants: z.array(contestantSchema),
  dispatcher: z.enum(DISPATCHER_KINDS),
  fixturePath: z.string().min(1),
  judgeRegistryKeys: z.array(z.string().min(1)).min(1),
  maxCredits: z.number().positive(),
  /** Owned by #5234; validated by `outliers/` once it lands. */
  outlierThresholds: z.unknown().optional(),
  seed: z.number().int(),
  suite: z.enum(SUITE_NAMES),
  tieBand: z.number().min(0).max(1),
});
export type SuiteConfig = z.infer<typeof suiteConfigSchema>;

// ─── Dispatcher port ────────────────────────────────────────────────────────

export interface EvalMessageTextPart {
  text: string;
  type: 'text';
}

export interface EvalMessageImagePart {
  image_url: { url: string };
  type: 'image_url';
}

export type EvalMessageContentPart = EvalMessageTextPart | EvalMessageImagePart;

export interface EvalMessage {
  content: string | EvalMessageContentPart[];
  role: 'system' | 'user' | 'assistant';
}

export interface EvalStructuredRequest<TResult> {
  maxTokens: number;
  messages: EvalMessage[];
  model: string;
  role: CallRole;
  schema: ZodType<TResult>;
  schemaName: string;
  seed: number;
  temperature: number;
}

export interface EvalUsage {
  completionTokens: number;
  /** Provider-reported USD charge; null when the route does not report one. */
  costUsd: number | null;
  promptTokens: number;
}

export interface EvalStructuredResponse<TResult> {
  latencyMs: number;
  /** Resolved model id the provider actually served. */
  modelVersion: string;
  provider: string;
  usage: EvalUsage;
  value: TResult;
}

/**
 * The only way a suite reaches a model. The live adapter wraps
 * `LlmDispatcherService.completeStructured`, so retention policy, BYOK routing
 * and the vendor cost ledger apply; a suite never calls a provider URL.
 */
export interface EvalDispatcher {
  completeStructured<TResult>(
    request: EvalStructuredRequest<TResult>,
  ): Promise<EvalStructuredResponse<TResult>>;
  close(): Promise<void>;
  readonly kind: DispatcherKind;
}

// ─── Provenance ─────────────────────────────────────────────────────────────

export const callSettingsSchema = z.object({
  maxTokens: z.number().int().positive(),
  temperature: z.number(),
});

export const callProvenanceSchema = z.object({
  /** Media answers: generation-brief capability profile version. */
  capabilityProfileVersion: z.string().nullable().default(null),
  callId: z.string().min(1),
  /** Media answers: generation-brief compiler version. */
  compilerVersion: z.string().nullable().default(null),
  completionTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  /** Whether `costUsd` was reported by the provider or priced by the harness. */
  costEvidence: z.enum(['reported', 'catalogue']),
  credits: z.number().nonnegative(),
  family: z.string().min(1),
  kind: z.enum(CALL_ROLES),
  latencyMs: z.number().nonnegative(),
  model: z.string().min(1),
  modelVersion: z.string().min(1),
  promptDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  promptTokens: z.number().int().nonnegative(),
  provider: z.string().min(1),
  rowId: z.string().min(1),
  rubricDigest: z
    .string()
    .regex(/^sha256:[0-9a-f]{64}$/)
    .nullable(),
  rubricVersion: z.string().nullable(),
  seed: z.number().int(),
  settings: callSettingsSchema,
});
export type CallProvenance = z.infer<typeof callProvenanceSchema>;
export type CallProvenanceInput = z.input<typeof callProvenanceSchema>;

export const spendSummarySchema = z.object({
  byKind: z.object({
    generation: z.number().nonnegative(),
    judge: z.number().nonnegative(),
  }),
  callCount: z.number().int().nonnegative(),
  maxCredits: z.number().positive(),
  spentCredits: z.number().nonnegative(),
  spentUsd: z.number().nonnegative(),
});
export type SpendSummary = z.infer<typeof spendSummarySchema>;

/** One non-LLM or LLM cost line charged against the run's cap. */
export interface SpendCharge {
  credits: number;
  kind: CallRole;
  provenance: CallProvenance;
}

// ─── Row results ────────────────────────────────────────────────────────────

export const contestantProvenanceSchema = z.object({
  family: z.string().min(1),
  guidanceArm: z.enum(['raw', 'brief']),
  id: z.string().min(1),
  isCompiled: z.boolean(),
  model: z.string().min(1),
  modelVersion: z.string().nullable(),
  provider: z.string().nullable(),
  registryKey: z.string().min(1),
});
export type ContestantProvenance = z.infer<typeof contestantProvenanceSchema>;

export const judgeVoteSchema = z.object({
  callId: z.string().nullable(),
  choice: z.enum(PAIRWISE_CHOICES).nullable(),
  family: z.string().min(1),
  judgeRegistryKey: z.string().min(1),
  model: z.string().min(1),
  modelVersion: z.string().nullable(),
  provider: z.string().nullable(),
  rationale: z.string().nullable(),
  /** Pointwise score on 0–1; null for a pairwise-only vote or a failure. */
  score: z.number().min(0).max(1).nullable(),
});
export type JudgeVote = z.infer<typeof judgeVoteSchema>;

export const deterministicCheckSchema = z.object({
  detail: z.string(),
  id: z.string().min(1),
  passed: z.boolean(),
});
export type DeterministicCheck = z.infer<typeof deterministicCheckSchema>;

/** One scored answer: a judged text, or one contestant's output on a row. */
export const scoredRowSchema = z.object({
  artifactRef: z.string().nullable(),
  brandFixtureId: z.string().min(1),
  callIds: z.array(z.string()),
  contentKind: z.string().min(1),
  contestant: contestantProvenanceSchema.nullable(),
  costCredits: z.number().nonnegative(),
  deterministicChecks: z.array(deterministicCheckSchema),
  fixtureId: z.string().min(1),
  fixtureVisibility: z.enum(FIXTURE_VISIBILITIES),
  humanLabel: z
    .object({
      band: scoreBandSchema.nullable(),
      decision: humanDecisionSchema.nullable(),
    })
    .nullable(),
  isAccepted: z.boolean().nullable(),
  latencyMs: z.number().nonnegative(),
  output: z.string().nullable(),
  rubricVersion: z.string().min(1),
  runId: z.string().min(1),
  suite: z.enum(SUITE_NAMES),
  voidReason: z.string().nullable(),
  votes: z.array(judgeVoteSchema),
});
export type ScoredRow = z.infer<typeof scoredRowSchema>;

export const pairwiseResultSchema = z.object({
  baselineId: z.string().min(1),
  battleVotes: z.array(judgeVoteSchema),
  challengerId: z.string().min(1),
  contentKind: z.string().min(1),
  fixtureId: z.string().min(1),
  isPositionBiased: z.boolean().nullable(),
  orderedChoice: z.enum(PAIRWISE_CHOICES).nullable(),
  pointwiseChoice: z.enum(PAIRWISE_CHOICES).nullable(),
  /** a = challenger wins, b = baseline wins; null when voided. */
  verdict: z.enum(PAIRWISE_CHOICES).nullable(),
  voidReason: z.string().nullable(),
});
export type PairwiseResult = z.infer<typeof pairwiseResultSchema>;

// ─── Summaries ──────────────────────────────────────────────────────────────

export const contestantSummarySchema = z.object({
  acceptedCount: z.number().int().nonnegative(),
  contestantId: z.string().min(1),
  creditsPerAcceptedOutput: z.number().nonnegative().nullable(),
  deterministicPassRate: z.number().min(0).max(1).nullable(),
  latencyP50Ms: z.number().nonnegative(),
  latencyP95Ms: z.number().nonnegative(),
  meanScore: z.number().min(0).max(1).nullable(),
  rows: z.number().int().nonnegative(),
  spentCredits: z.number().nonnegative(),
  voidRate: z.number().min(0).max(1),
  vsBaseline: z
    .object({
      lossRate: z.number().min(0).max(1),
      pairs: z.number().int().nonnegative(),
      tieRate: z.number().min(0).max(1),
      voidRate: z.number().min(0).max(1),
      winRate: z.number().min(0).max(1),
    })
    .nullable(),
});
export type ContestantSummary = z.infer<typeof contestantSummarySchema>;

export const judgeSummarySchema = z.object({
  bandAgreement: z.number().min(0).max(1).nullable(),
  judgeRegistryKey: z.string().min(1),
  labelledRows: z.number().int().nonnegative(),
  meanAbsoluteError: z.number().nonnegative().nullable(),
  scoredRows: z.number().int().nonnegative(),
});
export type JudgeSummary = z.infer<typeof judgeSummarySchema>;

export const thresholdCheckSchema = z.object({
  actual: z.number().nullable(),
  comparator: z.enum(['>=', '<=']),
  id: z.string().min(1),
  passed: z.boolean(),
  subject: z.string().min(1),
  threshold: z.number(),
});
export type ThresholdCheck = z.infer<typeof thresholdCheckSchema>;

export const suiteOutcomeSchema = z.object({
  contestants: z.array(contestantSummarySchema),
  judges: z.array(judgeSummarySchema),
  pairs: z.array(pairwiseResultSchema),
  positionBiasRate: z.number().min(0).max(1).nullable(),
  rows: z.array(scoredRowSchema),
  thresholdChecks: z.array(thresholdCheckSchema),
});
export type SuiteOutcome = z.infer<typeof suiteOutcomeSchema>;

// ─── Report ─────────────────────────────────────────────────────────────────

const digestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const rubricRecordSchema = z.object({
  choiceScores: z.record(z.string(), z.number()),
  digest: digestSchema,
  id: z.string().min(1),
  source: z.string().min(1),
  version: z.string().min(1),
});
export type RubricRecord = z.infer<typeof rubricRecordSchema>;

export const contentEvalReportSchema = z.object({
  aborted: z.enum(ABORT_REASONS).nullable(),
  abortMessage: z.string().nullable(),
  /** Bench match records from the media ladder (#4926). */
  benchMatches: z.array(matchSchema).optional(),
  calls: z.array(callProvenanceSchema),
  config: suiteConfigSchema,
  dispatcher: z.enum(DISPATCHER_KINDS),
  evidenceKind: z.enum(['stub-dispatcher', 'live-dispatcher']),
  fixture: z.object({
    digest: digestSchema,
    path: z.string().min(1),
    rowCount: z.number().int().nonnegative(),
  }),
  generatedAt: z.iso.datetime(),
  /** Stub runs never measure model quality; only live runs can. */
  modelQualityAssessed: z.boolean(),
  outcome: suiteOutcomeSchema,
  /** Owned by #5234; narrowed to its section schema when it lands. */
  outliers: z.unknown().optional(),
  passed: z.boolean(),
  rubrics: z.array(rubricRecordSchema),
  runId: z.string().min(1),
  schemaVersion: z.literal(CONTENT_EVAL_REPORT_SCHEMA_VERSION),
  sourceRevision: z.string().regex(/^[0-9a-f]{40}$/),
  spend: spendSummarySchema,
  suite: z.enum(SUITE_NAMES),
  thresholds: z.object({
    acceptedMinScore: z.number(),
    judgeMinBandAgreement: z.number(),
    maxPositionBiasRate: z.number(),
    maxVoidRate: z.number(),
    pointwiseTieBand: z.number(),
    version: z.string().min(1),
  }),
  workingTreeDirty: z.boolean(),
});
export type ContentEvalReport = z.infer<typeof contentEvalReportSchema>;

// ─── Suite runner ───────────────────────────────────────────────────────────

export interface SuiteContext {
  config: SuiteConfig;
  dispatcher: EvalDispatcher;
  judge: EvalJudge;
  ledger: EvalSpendLedger;
  rows: FixtureRow[];
  runId: string;
}

export interface SuiteRunner {
  /**
   * Returns what the suite has scored so far. On a spend abort the runner
   * catches `SpendCapExceededError` and still writes a partial report, so a
   * suite must push results as it goes via `onProgress`.
   */
  run(
    context: SuiteContext,
    onProgress: (outcome: SuiteOutcome) => void,
  ): Promise<SuiteOutcome>;
  readonly suite: SuiteName;
}

export interface EvalSpendLedger {
  charge(charge: SpendCharge): void;
  /** Throws before a call whose worst-case cost would breach the cap. */
  reserve(estimatedCredits: number): void;
  readonly calls: CallProvenance[];
  summary(): SpendSummary;
}

export interface PointwiseJudgement {
  callId: string | null;
  /** Why the judge produced no score (provider or schema failure). */
  failure: string | null;
  rationale: string | null;
  score: number | null;
  vote: JudgeVote;
}

export interface BattleJudgement {
  callId: string | null;
  failure: string | null;
  /** True when the judge preferred the response shown first. */
  isFirstPreferred: boolean | null;
  rationale: string | null;
  vote: JudgeVote;
}

export interface PointwiseJudgeRequest {
  judgeRegistryKey: string;
  output: string;
  row: FixtureRow;
}

export interface BattleJudgeRequest {
  first: string;
  judgeRegistryKey: string;
  row: FixtureRow;
  second: string;
}

export interface EvalJudge {
  battle(request: BattleJudgeRequest): Promise<BattleJudgement>;
  pointwise(request: PointwiseJudgeRequest): Promise<PointwiseJudgement>;
  rubrics(): RubricRecord[];
}

/** Versioned rubric in autoevals' ModelGradedSpec shape. */
export interface EvalRubricSpec {
  choiceScores: Record<string, number>;
  id: string;
  promptTemplate: string;
  /** Where the prompt text comes from, e.g. `autoevals@0.3.0:battle`. */
  source: string;
  version: string;
}

export interface CrossFamilyCheckInput {
  generatorRegistryKeys: string[];
  judgeRegistryKeys: string[];
}

// ─── Harness internals ──────────────────────────────────────────────────────

export interface LoadedFixture {
  digest: string;
  path: string;
  rows: FixtureRow[];
}

export interface SourceRevision {
  sourceRevision: string;
  workingTreeDirty: boolean;
}

export interface MeteredCallContext {
  dispatcher: EvalDispatcher;
  ledger: EvalSpendLedger;
  rowId: string;
  rubricDigest: string | null;
  rubricVersion: string | null;
}

export interface MeteredCallResult<TResult> {
  provenance: CallProvenance;
  response: EvalStructuredResponse<TResult>;
}

export interface StubDispatcherOptions {
  /** Registry keys whose calls fail, to exercise void handling. */
  failingModels?: string[];
  usdPerToken?: number;
}

export interface EvalJudgeOptions {
  dispatcher: EvalDispatcher;
  ledger: EvalSpendLedger;
  seed: number;
}

export interface JudgeClassifyInput {
  judgeRegistryKey: string;
  rowId: string;
  spec: EvalRubricSpec;
  variables: Record<string, unknown>;
}

export interface JudgeClassifyResult {
  choice: string;
  provenance: CallProvenance;
  reasons: string;
}

export interface JudgedText {
  callIds: string[];
  failures: string[];
  score: number | null;
  votes: JudgeVote[];
}

export interface ContestantAnswer {
  scoredRow: ScoredRow;
  text: string | null;
}

export interface OrderedChoice {
  choice: PairwiseChoice | null;
  isPositionBiased: boolean | null;
}

export interface PairJudging {
  biasFlags: Array<boolean | null>;
  pair: PairwiseResult;
}

export interface CallTotals {
  credits: number;
  latencyMs: number;
}

export interface ReportAnalyzerInput {
  fixtureRowsById: Map<string, FixtureRow>;
  pairs: PairwiseResult[];
  rows: ScoredRow[];
  runId: string;
  thresholds: unknown;
}

/** Adds a report section from already-scored results; never calls a model. */
export interface ReportAnalyzer {
  analyze(input: ReportAnalyzerInput): unknown;
  readonly key: 'outliers';
  summaryLines?(report: ContentEvalReport): string[];
}

export interface ReportInput {
  aborted: AbortReason | null;
  abortMessage: string | null;
  config: SuiteConfig;
  fixture: LoadedFixture;
  generatedAt: string;
  outcome: SuiteOutcome;
  revision: SourceRevision;
  rubrics: RubricRecord[];
  runId: string;
  spend: { calls: CallProvenance[]; summary: SpendSummary };
}

export interface ContentEvalRunOptions {
  createDispatcher: (kind: DispatcherKind) => Promise<EvalDispatcher>;
  dispatcherKind: DispatcherKind;
  fixturePath: string;
  judgeRegistryKeys: string[];
  maxCredits: number;
  models: string[];
  now?: Date;
  outlierThresholds?: unknown;
  runId?: string;
  seed: number;
  suite: SuiteName;
  tieBand: number;
}

export interface ContentEvalRunResult {
  exitCode: number;
  report: ContentEvalReport;
}

export interface ContentEvalCliArgs {
  dispatcherKind: DispatcherKind;
  fixturePath: string;
  judgeRegistryKeys: string[];
  maxCredits: number;
  models: string[];
  out: string | null;
  seed: number;
  suite: SuiteName;
  tieBand: number;
}
