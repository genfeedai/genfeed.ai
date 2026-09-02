/**
 * Post Scheduler API Contract
 *
 * Type-safe request schemas and inferred types for the scheduler domain:
 * release groups, channel targets, recurrence, and per-platform attachments
 * (comments / threads / signatures). This is the shared request-side contract
 * every surface uses — web app composer, calendar, workers, public API, MCP,
 * and CLI — paired with the serialized response interfaces in
 * `@genfeedai/contracts/interfaces` (`IReleaseGroup`, `IChannelTarget`, ...).
 *
 * Foundation for epic #1123 (Post Scheduler Loop), issue #1124.
 *
 * ---------------------------------------------------------------------------
 * Migration path from the legacy per-post schedule shape
 * ---------------------------------------------------------------------------
 * Today, scheduling lives as flat fields on the `Post` model (scheduledDate,
 * timezone, repeat*, externalId, ...). The scheduler contract promotes those to
 * a durable release-group + channel-target model:
 *
 *   - Each existing scheduled `Post` becomes one channel target under a release
 *     group. Posts sharing a `groupId` collapse into a single release group.
 *   - `Post.description` / `Post.label` seed the release `baseContent` / `title`.
 *   - `Post.repeat*` fields become an embedded {@link RecurrenceInput}.
 *   - `Post.externalId` / `externalShortcode` / `url` become target provider IDs.
 *
 * Create, update, and query accept `targetExecutionState` and `visibility`
 * only. Do not send or read a combined `Post.status` on those paths.
 */

import { z } from 'zod';
import {
  CredentialPlatform,
  PostFrequency,
  PostStatus,
  PostVisibility,
  ReleaseAttachmentKind,
  ReleaseStatus,
  TargetExecutionState,
  TargetValidationState,
} from '../..';
import {
  dateStringSchema,
  daysOfWeekSchema,
  nonEmptyStringSchema,
  nonNegativeIntSchema,
  optionalStringSchema,
  timezoneSchema,
} from '../helpers/common-schemas';
import { publishingProviderReadinessSchema } from './publishing-readiness.contract';

// ============================================================================
// Primitives
// ============================================================================

/** Entity identifier accepted by scheduler contracts. */
const idSchema = nonEmptyStringSchema({ max: 255 });

/** Idempotency key bounded to a safe header/column length. */
const idempotencyKeySchema = z.string().min(1).max(255);

/**
 * Provider-specific channel settings. Kept as an open, string-keyed map so the
 * shared contract stays platform-agnostic; channel-capabilities.contract narrows
 * and validates these per platform. `unknown`, never `any`.
 */
export const channelTargetSettingsSchema = z.record(z.string(), z.unknown());

// ============================================================================
// Zod Schemas — Request Validation
// ============================================================================

/** Media asset referenced by a release's base content. */
export const releaseMediaReferenceSchema = z.object({
  assetId: idSchema,
  kind: optionalStringSchema,
  order: nonNegativeIntSchema.optional(),
});

/** Recurrence rule for evergreen / repeating releases. */
export const recurrenceInputSchema = z
  .object({
    endDate: dateStringSchema.optional(),
    frequency: z.enum(PostFrequency),
    interval: z.number().int().positive(),
    maxRepeats: z.number().int().positive().optional(),
    weekdays: daysOfWeekSchema.optional(),
  })
  .refine((recurrence) => recurrence.frequency !== PostFrequency.NEVER, {
    message: 'A recurrence frequency must repeat.',
    path: ['frequency'],
  })
  .refine(
    (recurrence) =>
      recurrence.maxRepeats !== undefined || Boolean(recurrence.endDate),
    {
      message: 'A recurrence requires maxRepeats or endDate.',
      path: ['maxRepeats'],
    },
  )
  .refine(
    (recurrence) =>
      recurrence.frequency !== PostFrequency.WEEKLY ||
      Boolean(recurrence.weekdays?.length),
    {
      message: 'Weekly recurrence requires at least one weekday.',
      path: ['weekdays'],
    },
  )
  .refine(
    (recurrence) =>
      recurrence.frequency !== PostFrequency.WEEKLY ||
      recurrence.weekdays === undefined ||
      new Set(recurrence.weekdays).size === recurrence.weekdays.length,
    {
      message: 'Weekly recurrence weekdays must be unique.',
      path: ['weekdays'],
    },
  )
  .refine(
    (recurrence) =>
      recurrence.frequency === PostFrequency.WEEKLY ||
      recurrence.weekdays === undefined,
    {
      message: 'Weekdays are only valid for weekly recurrence.',
      path: ['weekdays'],
    },
  );

/** First comment / thread segment / signature attached to a release or target. */
export const releaseAttachmentInputSchema = z.object({
  body: z.string().min(1),
  kind: z.nativeEnum(ReleaseAttachmentKind),
  order: nonNegativeIntSchema.optional(),
  /** Platform scope; omit for a release-wide attachment (e.g. global signature). */
  platform: z.nativeEnum(CredentialPlatform).optional(),
});

/** Structured provider failure detail recorded against a channel target. */
export const channelTargetErrorSchema = z.object({
  code: z.string().min(1),
  failedAt: dateStringSchema.optional(),
  isRetryable: z.boolean(),
  message: z.string().min(1),
  providerDetail: z.unknown().optional(),
});

/** A single channel destination within a create-release request. */
export const channelTargetInputSchema = z.object({
  attachments: z.array(releaseAttachmentInputSchema).optional(),
  /** Per-target caption override; omit to inherit the release `baseContent`. */
  caption: z.string().optional(),
  credentialId: idSchema,
  order: nonNegativeIntSchema.optional(),
  platform: z.nativeEnum(CredentialPlatform),
  scheduledDate: dateStringSchema.optional(),
  settings: channelTargetSettingsSchema.optional(),
  timezone: timezoneSchema.optional(),
  visibility: z.nativeEnum(PostVisibility).default(PostVisibility.PUBLIC),
});

/** Create a release group and its channel targets in one call. */
export const createReleaseGroupSchema = z.object({
  attachments: z.array(releaseAttachmentInputSchema).optional(),
  baseContent: z.string().min(1),
  brandId: idSchema.optional(),
  campaignId: idSchema.optional(),
  idempotencyKey: idempotencyKeySchema.optional(),
  media: z.array(releaseMediaReferenceSchema).optional(),
  postingSetId: idSchema.optional(),
  recurrence: recurrenceInputSchema.optional(),
  rssFeedItemId: idSchema.optional(),
  rssSourceId: idSchema.optional(),
  scheduledDate: dateStringSchema.optional(),
  status: z.nativeEnum(ReleaseStatus).optional(),
  targets: z.array(channelTargetInputSchema).min(1),
  timezone: timezoneSchema,
  title: z.string().min(1),
});

/**
 * Partial update of a release group's shared fields. Channel targets are
 * mutated through their own update path ({@link updateChannelTargetSchema}).
 */
export const updateReleaseGroupSchema = z.object({
  attachments: z.array(releaseAttachmentInputSchema).optional(),
  baseContent: z.string().min(1).optional(),
  brandId: idSchema.optional(),
  campaignId: idSchema.nullable().optional(),
  media: z.array(releaseMediaReferenceSchema).optional(),
  recurrence: recurrenceInputSchema.nullable().optional(),
  scheduledDate: dateStringSchema.optional(),
  status: z.nativeEnum(ReleaseStatus).optional(),
  timezone: timezoneSchema.optional(),
  title: z.string().min(1).optional(),
});

/** Edit only future occurrences in an existing evergreen series. */
export const updateRecurrenceSeriesSchema = z
  .object({
    recurrence: recurrenceInputSchema.optional(),
    scheduledDate: dateStringSchema.optional(),
    timezone: timezoneSchema.optional(),
  })
  .refine(
    (input) =>
      input.recurrence !== undefined ||
      input.scheduledDate !== undefined ||
      input.timezone !== undefined,
    {
      message:
        'A future-series edit requires recurrence, scheduledDate, or timezone.',
    },
  );

/**
 * Update a single channel target. Shaped for both operator edits (reschedule,
 * settings) and worker execution-state writes (execution/validation state,
 * provider IDs, error, retry accounting) — the "update target state without
 * guessing post semantics" user story from #1124.
 */
export const updateChannelTargetSchema = z.object({
  error: channelTargetErrorSchema.nullable().optional(),
  executionState: z.nativeEnum(TargetExecutionState).optional(),
  externalProviderId: optionalStringSchema,
  externalShortcode: optionalStringSchema,
  idempotencyKey: idempotencyKeySchema.optional(),
  lastAttemptAt: dateStringSchema.optional(),
  order: nonNegativeIntSchema.optional(),
  publishedAt: dateStringSchema.optional(),
  readiness: publishingProviderReadinessSchema.nullable().optional(),
  retryCount: nonNegativeIntSchema.optional(),
  scheduledDate: dateStringSchema.optional(),
  settings: channelTargetSettingsSchema.optional(),
  timezone: timezoneSchema.optional(),
  url: optionalStringSchema,
  validationIssues: z.array(z.string()).optional(),
  validationState: z.nativeEnum(TargetValidationState).optional(),
  visibility: z.nativeEnum(PostVisibility).optional(),
});

// ============================================================================
// Inferred Types
// ============================================================================

export type ReleaseMediaReferenceInput = z.infer<
  typeof releaseMediaReferenceSchema
>;
export type RecurrenceInput = z.infer<typeof recurrenceInputSchema>;
export type ReleaseAttachmentInput = z.infer<
  typeof releaseAttachmentInputSchema
>;
export type ChannelTargetErrorInput = z.infer<typeof channelTargetErrorSchema>;
export type ChannelTargetInput = z.infer<typeof channelTargetInputSchema>;
export type CreateReleaseGroupInput = z.infer<typeof createReleaseGroupSchema>;
export type UpdateReleaseGroupInput = z.infer<typeof updateReleaseGroupSchema>;
export type UpdateRecurrenceSeriesInput = z.infer<
  typeof updateRecurrenceSeriesSchema
>;
export type UpdateChannelTargetInput = z.infer<
  typeof updateChannelTargetSchema
>;

// ============================================================================
// State transition helpers (audit-friendly, single source of truth)
// ============================================================================

/**
 * Whether a release status is terminal (no further automatic transitions).
 */
export function isTerminalReleaseStatus(status: ReleaseStatus): boolean {
  return (
    status === ReleaseStatus.PUBLISHED ||
    status === ReleaseStatus.CANCELLED ||
    status === ReleaseStatus.FAILED ||
    status === ReleaseStatus.PARTIALLY_PUBLISHED
  );
}

/**
 * Whether a channel target's execution state is terminal.
 */
export function isTerminalTargetExecutionState(
  state: TargetExecutionState,
): boolean {
  return (
    state === TargetExecutionState.PUBLISHED ||
    state === TargetExecutionState.CANCELLED ||
    state === TargetExecutionState.FAILED ||
    state === TargetExecutionState.SKIPPED
  );
}

/**
 * Derive the release-level status from the execution states of its targets.
 * Encapsulates the aggregate rules so composer, calendar, workers, and API all
 * report the same roll-up:
 *   - no targets                    -> DRAFT
 *   - any still publishing          -> PUBLISHING
 *   - all published                 -> PUBLISHED
 *   - all cancelled/skipped         -> CANCELLED
 *   - all paused                    -> PAUSED
 *   - some published, some not      -> PARTIALLY_PUBLISHED
 *   - all failed/cancelled/skipped  -> FAILED
 *   - otherwise (still queued)      -> SCHEDULED
 *
 * `SKIPPED` is a terminal, benign non-publish — a target intentionally
 * excluded from the run (e.g. a disabled credential), never an error (see the
 * {@link TargetExecutionState} doc and {@link isTerminalTargetExecutionState}).
 * `ReleaseStatus` has no `skipped` value, so at the roll-up level a skipped
 * target behaves like a cancelled one: it did not publish, did not fail, and is
 * done. Folding skipped into cancelled keeps every terminal combination landing
 * on a real terminal status instead of falling through to `SCHEDULED`.
 */
export type ReleaseStatusDerivationDiagnostic = {
  code: 'empty-target-set' | 'invalid-target-state';
  invalidTargetIndexes: number[];
  targetCount: number;
  validTargetCount: number;
};

export type ReleaseStatusProjection = {
  diagnostics: ReleaseStatusDerivationDiagnostic[];
  status: ReleaseStatus;
};

type TargetStateCounts = Record<TargetExecutionState, number>;

type ReleaseStatusAggregationRule = {
  matches: (counts: TargetStateCounts, total: number) => boolean;
  status: ReleaseStatus;
};

const TARGET_EXECUTION_STATES = new Set<string>(
  Object.values(TargetExecutionState),
);

function isTargetExecutionState(value: unknown): value is TargetExecutionState {
  return typeof value === 'string' && TARGET_EXECUTION_STATES.has(value);
}

/**
 * Ordered, exhaustive aggregation table for every valid non-empty target set.
 * The first matching row wins. Published work remains visible as partial unless
 * another target is actively publishing, while queued work remains scheduled.
 */
const RELEASE_STATUS_AGGREGATION_TABLE: readonly ReleaseStatusAggregationRule[] =
  [
    {
      matches: (counts) => counts[TargetExecutionState.PUBLISHING] > 0,
      status: ReleaseStatus.PUBLISHING,
    },
    {
      matches: (counts, total) => counts[TargetExecutionState.DRAFT] === total,
      status: ReleaseStatus.DRAFT,
    },
    {
      matches: (counts, total) =>
        counts[TargetExecutionState.PUBLISHED] === total,
      status: ReleaseStatus.PUBLISHED,
    },
    {
      matches: (counts, total) =>
        counts[TargetExecutionState.CANCELLED] +
          counts[TargetExecutionState.SKIPPED] ===
        total,
      status: ReleaseStatus.CANCELLED,
    },
    {
      matches: (counts, total) => counts[TargetExecutionState.PAUSED] === total,
      status: ReleaseStatus.PAUSED,
    },
    {
      matches: (counts) => counts[TargetExecutionState.PUBLISHED] > 0,
      status: ReleaseStatus.PARTIALLY_PUBLISHED,
    },
    {
      matches: (counts, total) =>
        counts[TargetExecutionState.FAILED] +
          counts[TargetExecutionState.CANCELLED] +
          counts[TargetExecutionState.SKIPPED] ===
        total,
      status: ReleaseStatus.FAILED,
    },
    {
      matches: () => true,
      status: ReleaseStatus.SCHEDULED,
    },
  ];

/**
 * Canonical release projection, including fail-closed diagnostics for callers
 * that need to log malformed persisted data. A malformed non-empty set reports
 * `FAILED`; an empty set remains `DRAFT`. Neither path can claim publication.
 */
export function deriveReleaseStatusProjectionFromTargets(
  targetStates: readonly unknown[],
): ReleaseStatusProjection {
  if (targetStates.length === 0) {
    return {
      diagnostics: [
        {
          code: 'empty-target-set',
          invalidTargetIndexes: [],
          targetCount: 0,
          validTargetCount: 0,
        },
      ],
      status: ReleaseStatus.DRAFT,
    };
  }

  const counts: TargetStateCounts = {
    [TargetExecutionState.CANCELLED]: 0,
    [TargetExecutionState.DRAFT]: 0,
    [TargetExecutionState.FAILED]: 0,
    [TargetExecutionState.PAUSED]: 0,
    [TargetExecutionState.PUBLISHED]: 0,
    [TargetExecutionState.PUBLISHING]: 0,
    [TargetExecutionState.SCHEDULED]: 0,
    [TargetExecutionState.SKIPPED]: 0,
  };
  const invalidTargetIndexes: number[] = [];

  for (const [index, state] of targetStates.entries()) {
    if (!isTargetExecutionState(state)) {
      invalidTargetIndexes.push(index);
      continue;
    }
    counts[state] += 1;
  }

  const validTargetCount = targetStates.length - invalidTargetIndexes.length;
  if (invalidTargetIndexes.length > 0) {
    return {
      diagnostics: [
        {
          code: 'invalid-target-state',
          invalidTargetIndexes,
          targetCount: targetStates.length,
          validTargetCount,
        },
      ],
      status: ReleaseStatus.FAILED,
    };
  }

  const rule = RELEASE_STATUS_AGGREGATION_TABLE.find(({ matches }) =>
    matches(counts, validTargetCount),
  );
  return {
    diagnostics: [],
    status: rule?.status ?? ReleaseStatus.FAILED,
  };
}

export function deriveReleaseStatusFromTargets(
  targetStates: readonly TargetExecutionState[],
): ReleaseStatus {
  return deriveReleaseStatusProjectionFromTargets(targetStates).status;
}

/**
 * Resolve stored visibility. Unknown or unset values fail closed to public
 * instead of leaking provider data.
 */
export function resolvePostVisibility(
  visibility: string | null | undefined,
): PostVisibility {
  const parsed = z.nativeEnum(PostVisibility).safeParse(visibility);
  return parsed.success ? parsed.data : PostVisibility.PUBLIC;
}

/**
 * Compatibility projection for classic Post consumers. Canonical writes never
 * persist this value; #2642 owns retiring the projection after rollout.
 */
export function projectLegacyPostStatus(
  executionState: TargetExecutionState,
  visibility: PostVisibility,
): PostStatus {
  switch (executionState) {
    case TargetExecutionState.DRAFT:
      return PostStatus.DRAFT;
    case TargetExecutionState.PUBLISHING:
      return PostStatus.PROCESSING;
    case TargetExecutionState.PUBLISHED:
      switch (visibility) {
        case PostVisibility.PRIVATE:
          return PostStatus.PRIVATE;
        case PostVisibility.UNLISTED:
          return PostStatus.UNLISTED;
        case PostVisibility.PUBLIC:
          return PostStatus.PUBLIC;
      }
      return PostStatus.PUBLIC;
    case TargetExecutionState.FAILED:
      return PostStatus.FAILED;
    case TargetExecutionState.CANCELLED:
    case TargetExecutionState.PAUSED:
    case TargetExecutionState.SCHEDULED:
    case TargetExecutionState.SKIPPED:
      return PostStatus.SCHEDULED;
  }
}

/**
 * Inverse of {@link projectLegacyPostStatus} for write and list-filter clients
 * that still speak the projected `Post.status` vocabulary.
 */
export function mapPostStatusToCanonicalWrite(
  status: string | PostStatus | undefined,
): {
  targetExecutionState?: TargetExecutionState;
  visibility?: PostVisibility;
} {
  switch (status) {
    case PostStatus.DRAFT:
      return { targetExecutionState: TargetExecutionState.DRAFT };
    case PostStatus.SCHEDULED:
      return { targetExecutionState: TargetExecutionState.SCHEDULED };
    case PostStatus.FAILED:
      return { targetExecutionState: TargetExecutionState.FAILED };
    case PostStatus.PENDING:
    case PostStatus.PROCESSING:
      return { targetExecutionState: TargetExecutionState.PUBLISHING };
    case PostStatus.PUBLIC:
      return {
        targetExecutionState: TargetExecutionState.PUBLISHED,
        visibility: PostVisibility.PUBLIC,
      };
    case PostStatus.PRIVATE:
      return {
        targetExecutionState: TargetExecutionState.PUBLISHED,
        visibility: PostVisibility.PRIVATE,
      };
    case PostStatus.UNLISTED:
      return {
        targetExecutionState: TargetExecutionState.PUBLISHED,
        visibility: PostVisibility.UNLISTED,
      };
    default:
      return {};
  }
}

/**
 * Create-path default when `targetExecutionState` is omitted. A leftover
 * `status` field must not silently schedule — that is rejected at the DTO
 * boundary. An explicit scheduled date is the only omitted-state signal that
 * means "schedule this".
 */
export function resolveDefaultTargetExecutionState(input: {
  scheduledDate?: Date | string | null;
  targetExecutionState?: TargetExecutionState;
}): TargetExecutionState {
  if (input.targetExecutionState) {
    return input.targetExecutionState;
  }

  return input.scheduledDate
    ? TargetExecutionState.SCHEDULED
    : TargetExecutionState.DRAFT;
}

/** Read filter for canonical target execution state. */
export function postExecutionStateReadFilter(
  states: TargetExecutionState | readonly TargetExecutionState[],
): Record<string, unknown> {
  const requested: readonly TargetExecutionState[] =
    typeof states === 'string' ? [states] : states;

  return requested.length === 1
    ? { targetExecutionState: requested[0] }
    : { targetExecutionState: { in: requested } };
}

/** Read filter for the audience visibility axis. */
export function postVisibilityReadFilter(
  visibility: PostVisibility,
): Record<string, unknown> {
  return { visibility };
}
