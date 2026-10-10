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

/** Why one item of a background Turbo rewrite was not rewritten. */
export enum TurboRewriteItemFailureReason {
  /** The draft changed after the rewrite was queued (per-post optimistic lock). */
  CONFLICT = 'conflict',
  INSUFFICIENT_CREDITS = 'insufficient_credits',
  /** Published, publishing, skipped, cancelled, or no longer in the run. */
  NOT_REWRITABLE = 'not_rewritable',
  GENERATION_FAILED = 'generation_failed',
}
