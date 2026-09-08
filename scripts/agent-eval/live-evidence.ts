import { z } from 'zod';
import type { EvidenceValidation } from './contracts';

export const SMOKE_CRITERIA = [
  'new-thread',
  'existing-thread',
  'scoped-context',
  'safe-read',
  'structured-question',
  'editable-work',
  'prepare-without-effect',
  'confirm-exact-intent',
  'reject-invalid-confirmation',
  'duplicate-prevention',
  'durable-completion',
  'reload-reconnect',
  'cancel-active',
  'late-stop-noop',
  'interrupt-tool',
  'retryable-failure',
  'terminal-failure',
  'safe-rendering',
] as const;

const identifier = z.string().trim().min(1);
const observationSchema = z
  .object({
    criterion: z.enum(SMOKE_CRITERIA),
    status: z.enum(['passed', 'failed', 'blocked']),
    runId: identifier,
    evidenceRefs: z.array(identifier).min(1),
  })
  .strict();
const journeySchema = z
  .object({
    attemptSequence: z.number().int().positive(),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime(),
    threadId: identifier,
    runIds: z.array(identifier).min(1),
    workflowExecutionId: identifier,
    preparedIntentId: identifier,
    confirmationId: identifier,
    logicalWriteKey: z.string().regex(/^[a-f0-9]{64}$/),
    model: z
      .object({
        provider: identifier,
        providerVersion: identifier,
        model: identifier,
        modelVersion: identifier,
      })
      .strict(),
    counters: z
      .object({
        duplicateMutations: z.number().int().nonnegative(),
        staleTerminalStates: z.number().int().nonnegative(),
        unhandledClientErrors: z.number().int().nonnegative(),
        deadEnds: z.number().int().nonnegative(),
      })
      .strict(),
    observations: z.array(observationSchema),
  })
  .strict();
export const liveEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    evidenceKind: z.literal('production-like-canonical-smoke'),
    sourceRevision: z.string().regex(/^[a-f0-9]{40}$/),
    environment: identifier,
    captureRef: identifier,
    usesMockTransport: z.literal(false),
    usesMockProvider: z.literal(false),
    journeys: z.array(journeySchema).length(5),
  })
  .strict();

export function validateLiveEvidence(input: unknown): EvidenceValidation {
  const parsed = liveEvidenceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      complete: false,
      errors: parsed.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      ),
    };
  }
  const errors: string[] = [];
  const seenRuns = new Set<string>();
  const seenWorkflows = new Set<string>();
  const seenIntents = new Set<string>();
  const seenConfirmations = new Set<string>();
  const seenWriteKeys = new Set<string>();
  let previousAttempt: number | undefined;
  let previousFinish: number | undefined;
  for (const journey of parsed.data.journeys) {
    const prefix = `attempt ${journey.attemptSequence}`;
    if (
      previousAttempt !== undefined &&
      journey.attemptSequence !== previousAttempt + 1
    )
      errors.push(`${prefix}: attempts must be consecutive`);
    previousAttempt = journey.attemptSequence;
    const start = Date.parse(journey.startedAt);
    const finish = Date.parse(journey.finishedAt);
    if (finish <= start) errors.push(`${prefix}: finish must follow start`);
    if (previousFinish !== undefined && start < previousFinish)
      errors.push(`${prefix}: journeys must run sequentially`);
    previousFinish = finish;
    for (const run of journey.runIds) {
      if (seenRuns.has(run))
        errors.push(`${prefix}: run reused across journeys: ${run}`);
      seenRuns.add(run);
    }
    for (const [value, seen, label] of [
      [journey.workflowExecutionId, seenWorkflows, 'workflow'],
      [journey.preparedIntentId, seenIntents, 'intent'],
      [journey.confirmationId, seenConfirmations, 'confirmation'],
      [journey.logicalWriteKey, seenWriteKeys, 'write key'],
    ] as const) {
      if (seen.has(value))
        errors.push(`${prefix}: ${label} reused across journeys`);
      seen.add(value);
    }
    if (Object.values(journey.counters).some((value) => value !== 0))
      errors.push(`${prefix}: acceptance counters must all be zero`);
    const byCriterion = new Map(
      journey.observations.map((observation) => [
        observation.criterion,
        observation,
      ]),
    );
    if (byCriterion.size !== journey.observations.length)
      errors.push(`${prefix}: duplicate criterion`);
    for (const criterion of SMOKE_CRITERIA) {
      const observation = byCriterion.get(criterion);
      if (!observation) {
        errors.push(`${prefix}: missing ${criterion}`);
      } else {
        if (observation.status !== 'passed')
          errors.push(`${prefix}: ${criterion} is ${observation.status}`);
        if (!journey.runIds.includes(observation.runId))
          errors.push(`${prefix}: ${criterion} references an uncorrelated run`);
      }
    }
    if (
      Object.values(journey.model).some((value) =>
        ['none', 'unknown', 'not-applicable', 'mock'].includes(
          value.toLowerCase(),
        ),
      )
    )
      errors.push(`${prefix}: live model/provider versions must be recorded`);
  }
  return { complete: errors.length === 0, errors };
}
