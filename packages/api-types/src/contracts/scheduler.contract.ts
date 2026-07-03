/**
 * Post Scheduler API Contract
 *
 * Type-safe request schemas and inferred types for the scheduler domain:
 * release groups, channel targets, recurrence, and per-platform attachments
 * (comments / threads / signatures). This is the shared request-side contract
 * every surface uses — web app composer, calendar, workers, public API, MCP,
 * and CLI — paired with the serialized response interfaces in
 * `@genfeedai/interfaces` (`IReleaseGroup`, `IChannelTarget`, ...).
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
 * {@link LEGACY_POST_SCHEDULE_FIELD_MAP} and the mapper helpers below document
 * and encode that mapping; the persistence/backfill work is owned by #1127.
 * The mapping is backward-compatible: no legacy field is dropped, only relocated.
 */

import {
  dateStringSchema,
  daysOfWeekSchema,
  nonEmptyStringSchema,
  nonNegativeIntSchema,
  optionalStringSchema,
  timezoneSchema,
} from '@api-types/helpers/common-schemas';
import {
  CredentialPlatform,
  PostFrequency,
  PostStatus,
  ReleaseAttachmentKind,
  ReleaseStatus,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/enums';
import { z } from 'zod';

// ============================================================================
// Primitives
// ============================================================================

/**
 * Entity identifier. Postgres/Prisma ids are CUIDs, so this is a non-empty
 * string rather than the legacy 24-char Mongo ObjectId shape.
 */
const idSchema = nonEmptyStringSchema({ max: 255 });

/** Idempotency key bounded to a safe header/column length. */
const idempotencyKeySchema = z.string().min(1).max(255);

/**
 * Provider-specific channel settings. Kept as an open, string-keyed map so the
 * shared contract stays platform-agnostic; the per-platform capability schema
 * (a later #1123 issue) narrows and validates these. `unknown`, never `any`.
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
export const recurrenceInputSchema = z.object({
  endDate: dateStringSchema.optional(),
  frequency: z.nativeEnum(PostFrequency),
  interval: z.number().int().positive(),
  maxRepeats: nonNegativeIntSchema.optional(),
  weekdays: daysOfWeekSchema.optional(),
});

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
  credentialId: idSchema,
  order: nonNegativeIntSchema.optional(),
  platform: z.nativeEnum(CredentialPlatform),
  scheduledDate: dateStringSchema.optional(),
  settings: channelTargetSettingsSchema.optional(),
  timezone: timezoneSchema.optional(),
});

/** Create a release group and its channel targets in one call. */
export const createReleaseGroupSchema = z.object({
  attachments: z.array(releaseAttachmentInputSchema).optional(),
  baseContent: z.string().min(1),
  brandId: idSchema.optional(),
  idempotencyKey: idempotencyKeySchema.optional(),
  media: z.array(releaseMediaReferenceSchema).optional(),
  recurrence: recurrenceInputSchema.optional(),
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
  media: z.array(releaseMediaReferenceSchema).optional(),
  recurrence: recurrenceInputSchema.nullable().optional(),
  scheduledDate: dateStringSchema.optional(),
  status: z.nativeEnum(ReleaseStatus).optional(),
  timezone: timezoneSchema.optional(),
  title: z.string().min(1).optional(),
});

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
  retryCount: nonNegativeIntSchema.optional(),
  scheduledDate: dateStringSchema.optional(),
  settings: channelTargetSettingsSchema.optional(),
  timezone: timezoneSchema.optional(),
  url: optionalStringSchema,
  validationIssues: z.array(z.string()).optional(),
  validationState: z.nativeEnum(TargetValidationState).optional(),
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
 *   - no targets              -> DRAFT
 *   - any still publishing    -> PUBLISHING
 *   - all published           -> PUBLISHED
 *   - all cancelled           -> CANCELLED
 *   - all failed/cancelled    -> FAILED
 *   - some published, some not -> PARTIALLY_PUBLISHED
 *   - otherwise (still queued) -> SCHEDULED
 */
export function deriveReleaseStatusFromTargets(
  targetStates: readonly TargetExecutionState[],
): ReleaseStatus {
  if (targetStates.length === 0) {
    return ReleaseStatus.DRAFT;
  }

  if (targetStates.some((state) => state === TargetExecutionState.PUBLISHING)) {
    return ReleaseStatus.PUBLISHING;
  }

  const published = targetStates.filter(
    (state) => state === TargetExecutionState.PUBLISHED,
  ).length;
  const cancelled = targetStates.filter(
    (state) => state === TargetExecutionState.CANCELLED,
  ).length;
  const failed = targetStates.filter(
    (state) => state === TargetExecutionState.FAILED,
  ).length;

  if (published === targetStates.length) {
    return ReleaseStatus.PUBLISHED;
  }
  if (cancelled === targetStates.length) {
    return ReleaseStatus.CANCELLED;
  }
  if (published > 0) {
    return ReleaseStatus.PARTIALLY_PUBLISHED;
  }
  if (failed + cancelled === targetStates.length) {
    return ReleaseStatus.FAILED;
  }

  return ReleaseStatus.SCHEDULED;
}

// ============================================================================
// Legacy Post schedule migration
// ============================================================================

/**
 * Documents where each legacy `Post` schedule field lands in the release-group
 * + channel-target contract. Dot paths are namespaced by target: `release.*`,
 * `target.*`, and `recurrence.*`. Consumed as the reference for the #1127
 * backfill; every legacy field is relocated, never dropped.
 */
export const LEGACY_POST_SCHEDULE_FIELD_MAP = {
  credential: 'target.credentialId',
  description: 'release.baseContent',
  externalId: 'target.externalProviderId',
  externalShortcode: 'target.externalShortcode',
  isRepeat: 'release.recurrence',
  label: 'release.title',
  lastAttemptAt: 'target.lastAttemptAt',
  maxRepeats: 'recurrence.maxRepeats',
  nextScheduledDate: 'recurrence.nextRunAt',
  platform: 'target.platform',
  publishedAt: 'target.publishedAt',
  repeatCount: 'recurrence.repeatCount',
  repeatDaysOfWeek: 'recurrence.weekdays',
  repeatEndDate: 'recurrence.endDate',
  repeatFrequency: 'recurrence.frequency',
  repeatInterval: 'recurrence.interval',
  retryCount: 'target.retryCount',
  scheduledDate: 'target.scheduledDate',
  status: 'release.status',
  timezone: 'release.timezone',
  url: 'target.url',
} as const satisfies Record<string, string>;

/**
 * Map a legacy `Post.status` (lowercase {@link PostStatus} value) to the new
 * release-level status. Published-visibility variants collapse to `PUBLISHED`.
 */
export function mapLegacyPostStatusToReleaseStatus(
  status: string,
): ReleaseStatus {
  switch (status) {
    case PostStatus.DRAFT:
      return ReleaseStatus.DRAFT;
    case PostStatus.SCHEDULED:
      return ReleaseStatus.SCHEDULED;
    case PostStatus.PENDING:
    case PostStatus.PROCESSING:
      return ReleaseStatus.PUBLISHING;
    case PostStatus.FAILED:
      return ReleaseStatus.FAILED;
    case PostStatus.PUBLIC:
    case PostStatus.PRIVATE:
    case PostStatus.UNLISTED:
      return ReleaseStatus.PUBLISHED;
    default:
      return ReleaseStatus.DRAFT;
  }
}

/**
 * Map a legacy `Post.status` to a single channel target's execution state.
 * Unlike the release roll-up, a target has no `PARTIALLY_PUBLISHED` value.
 */
export function mapLegacyPostStatusToTargetExecutionState(
  status: string,
): TargetExecutionState {
  switch (status) {
    case PostStatus.DRAFT:
      return TargetExecutionState.DRAFT;
    case PostStatus.SCHEDULED:
      return TargetExecutionState.SCHEDULED;
    case PostStatus.PENDING:
    case PostStatus.PROCESSING:
      return TargetExecutionState.PUBLISHING;
    case PostStatus.FAILED:
      return TargetExecutionState.FAILED;
    case PostStatus.PUBLIC:
    case PostStatus.PRIVATE:
    case PostStatus.UNLISTED:
      return TargetExecutionState.PUBLISHED;
    default:
      return TargetExecutionState.DRAFT;
  }
}
