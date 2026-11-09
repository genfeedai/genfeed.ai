import { defineStateMachine } from './state-machine.util';

/**
 * Turbo run lifecycle statuses.
 *
 * Values MUST match the Prisma/Postgres `TurboRunStatus` enum exactly
 * (SCREAMING_SNAKE). Do not reintroduce lowercase wire values — that dual
 * spelling is what made `as never` hide invalid writes.
 *
 * @see packages/prisma/prisma/schema.prisma `enum TurboRunStatus`
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
export enum TurboRunStatus {
  PENDING = 'PENDING',
  /** In-progress generation. Same label as Prisma `PROCESSING`. */
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  PARTIAL = 'PARTIAL',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * Per-item status. Values MUST match the Prisma/Postgres `TurboRunItemStatus`
 * enum exactly (SCREAMING_SNAKE). The payload still lives on `TurboRunItem.data`
 * / `Turbo run.items`; status itself is a typed column.
 *
 * @see packages/prisma/prisma/schema.prisma `enum TurboRunItemStatus`
 */
export enum TurboRunItemStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

/**
 * Turbo run lifecycle (#9739):
 *
 * - A generated run is created PENDING; a manual review run is created
 *   COMPLETED.
 * - The processor claims PENDING → PROCESSING, or re-claims a stale
 *   PROCESSING lease, and settles PROCESSING as COMPLETED, PARTIAL or FAILED.
 * - Reconcile fails a PENDING or PROCESSING run that was interrupted.
 * - Cancelling a pending or processing run moves it to CANCELLED.
 *
 * `cancelTurboRun` and `updateTurboRun` do not compare the current status
 * yet, so they can also write over a settled run.
 */
export const TURBO_RUN_STATE_MACHINE = defineStateMachine<TurboRunStatus>({
  terminal: [
    TurboRunStatus.COMPLETED,
    TurboRunStatus.PARTIAL,
    TurboRunStatus.FAILED,
    TurboRunStatus.CANCELLED,
  ],
  transitions: {
    [TurboRunStatus.PENDING]: [
      TurboRunStatus.PROCESSING,
      TurboRunStatus.FAILED,
      TurboRunStatus.CANCELLED,
    ],
    [TurboRunStatus.PROCESSING]: [
      TurboRunStatus.PROCESSING,
      TurboRunStatus.COMPLETED,
      TurboRunStatus.PARTIAL,
      TurboRunStatus.FAILED,
      TurboRunStatus.CANCELLED,
    ],
    [TurboRunStatus.COMPLETED]: [],
    [TurboRunStatus.PARTIAL]: [],
    [TurboRunStatus.FAILED]: [],
    [TurboRunStatus.CANCELLED]: [],
  },
});

/** Whether a run has settled, so its progress stops being polled. */
export function isTurboRunSettled(status: TurboRunStatus): boolean {
  return TURBO_RUN_STATE_MACHINE.isTerminal(status);
}

/**
 * Turbo run item lifecycle (#9739):
 *
 * - The processor moves PENDING → PROCESSING → COMPLETED or FAILED, and puts
 *   an interrupted PROCESSING item back to PENDING when a run resumes.
 * - Manual review runs create items COMPLETED.
 * - Cancelling a run skips its PENDING items; rejecting a reviewed draft
 *   skips its COMPLETED item.
 * - Reconcile fails every item of an interrupted run that is neither
 *   COMPLETED nor FAILED, including a skipped one.
 */
export const TURBO_RUN_ITEM_STATE_MACHINE =
  defineStateMachine<TurboRunItemStatus>({
    terminal: [
      TurboRunItemStatus.COMPLETED,
      TurboRunItemStatus.FAILED,
      TurboRunItemStatus.SKIPPED,
    ],
    transitions: {
      [TurboRunItemStatus.PENDING]: [
        TurboRunItemStatus.PROCESSING,
        TurboRunItemStatus.FAILED,
        TurboRunItemStatus.SKIPPED,
      ],
      [TurboRunItemStatus.PROCESSING]: [
        TurboRunItemStatus.PENDING,
        TurboRunItemStatus.COMPLETED,
        TurboRunItemStatus.FAILED,
      ],
      [TurboRunItemStatus.COMPLETED]: [TurboRunItemStatus.SKIPPED],
      [TurboRunItemStatus.FAILED]: [],
      [TurboRunItemStatus.SKIPPED]: [TurboRunItemStatus.FAILED],
    },
  });

/**
 * Studio Turbo project kind (#5463). Values match Prisma `TurboProjectKind`.
 *
 * @see packages/prisma/prisma/schema.prisma `enum TurboProjectKind`
 */
export enum TurboProjectKind {
  IDEAS = 'IDEAS',
  WORKFLOW = 'WORKFLOW',
}

/**
 * Studio Turbo project lifecycle. Values match Prisma `TurboProjectStatus`.
 * The API derives it from the project's items (`deriveTurboProjectStatus`);
 * writers set it directly only to create a DRAFT, claim DRAFT → GENERATING
 * (compare-and-set, so a repeated start is refused), roll a start that never
 * reached its workflow back to DRAFT, and mark a retried project GENERATING.
 *
 * @see packages/prisma/prisma/schema.prisma `enum TurboProjectStatus`
 */
export enum TurboProjectStatus {
  DRAFT = 'DRAFT',
  GENERATING = 'GENERATING',
  REVIEWING = 'REVIEWING',
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  PARTIAL_FAILURE = 'PARTIAL_FAILURE',
  CANCELLED = 'CANCELLED',
}

/**
 * Per-item state of a Studio Turbo project. Values match Prisma
 * `TurboProjectItemStatus`.
 *
 * @see packages/prisma/prisma/schema.prisma `enum TurboProjectItemStatus`
 */
export enum TurboProjectItemStatus {
  PENDING = 'PENDING',
  GENERATING = 'GENERATING',
  READY = 'READY',
  FAILED = 'FAILED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

/**
 * Studio Turbo project item lifecycle (#9739). Every writer compares the
 * item's current status in its `where`:
 *
 * - Starting a draft claims PENDING → GENERATING; a start that cannot reach
 *   the workflow puts the items back to PENDING.
 * - Reconcile records GENERATING → READY (sent to review) or FAILED.
 * - Retry claims FAILED → GENERATING.
 * - Review inbox decisions move READY, APPROVED and REJECTED between each
 *   other (`syncReviewDecisions`).
 *
 * Terminal means generation settled; review decisions and retry still move
 * a settled item.
 */
export const TURBO_PROJECT_ITEM_STATE_MACHINE =
  defineStateMachine<TurboProjectItemStatus>({
    terminal: [
      TurboProjectItemStatus.READY,
      TurboProjectItemStatus.FAILED,
      TurboProjectItemStatus.APPROVED,
      TurboProjectItemStatus.REJECTED,
    ],
    transitions: {
      [TurboProjectItemStatus.PENDING]: [TurboProjectItemStatus.GENERATING],
      [TurboProjectItemStatus.GENERATING]: [
        TurboProjectItemStatus.PENDING,
        TurboProjectItemStatus.READY,
        TurboProjectItemStatus.FAILED,
      ],
      [TurboProjectItemStatus.READY]: [
        TurboProjectItemStatus.APPROVED,
        TurboProjectItemStatus.REJECTED,
      ],
      [TurboProjectItemStatus.FAILED]: [TurboProjectItemStatus.GENERATING],
      [TurboProjectItemStatus.APPROVED]: [
        TurboProjectItemStatus.READY,
        TurboProjectItemStatus.REJECTED,
      ],
      [TurboProjectItemStatus.REJECTED]: [
        TurboProjectItemStatus.READY,
        TurboProjectItemStatus.APPROVED,
      ],
    },
  });

/** Items with an output in the review inbox, whose decision is mirrored back. */
export const TURBO_PROJECT_ITEM_REVIEWABLE_STATUSES: readonly TurboProjectItemStatus[] =
  [
    TurboProjectItemStatus.APPROVED,
    TurboProjectItemStatus.READY,
    TurboProjectItemStatus.REJECTED,
  ];

/**
 * Wizard step a Studio Turbo project reopens at. Persisted in the
 * `turbo_projects.step` String column as lowercase product vocabulary.
 */
export enum TurboProjectStep {
  INPUTS = 'inputs',
  IDEAS = 'ideas',
  REVIEW = 'review',
  SCHEDULE = 'schedule',
}

export enum ContentFormat {
  IMAGE = 'image',
  VIDEO = 'video',
  CAROUSEL = 'carousel',
  REEL = 'reel',
  STORY = 'story',
}

/**
 * Reference image category. Values match Prisma `ReferenceImageCategory`.
 *
 * @see packages/prisma/prisma/schema.prisma `enum ReferenceImageCategory`
 */
export enum ReferenceImageCategory {
  FACE = 'FACE',
  PRODUCT = 'PRODUCT',
  STYLE = 'STYLE',
  LOGO = 'LOGO',
}

/**
 * Lifecycle of a background Review run rewrite (#5365). Not persisted in
 * Postgres: the BullMQ job state is the source of truth, so these are API wire
 * values only.
 */
export enum TurboRewriteJobStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  PARTIALLY_FAILED = 'partially_failed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/** Whether a background rewrite has stopped, so its progress stops being read. */
export function isTerminalTurboRewriteJobStatus(
  status: TurboRewriteJobStatus,
): boolean {
  return (
    status !== TurboRewriteJobStatus.QUEUED &&
    status !== TurboRewriteJobStatus.PROCESSING
  );
}

/** Why one item of a background Turbo rewrite was not rewritten. */
export enum TurboRewriteItemFailureReason {
  /** The draft changed after the rewrite was queued (per-post optimistic lock). */
  CONFLICT = 'conflict',
  INSUFFICIENT_CREDITS = 'insufficient_credits',
  /** Published, publishing, skipped, cancelled, or no longer in the run. */
  NOT_REWRITABLE = 'not_rewritable',
  GENERATION_FAILED = 'generation_failed',
}
