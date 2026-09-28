/**
 * Batch lifecycle statuses.
 *
 * Values MUST match the Prisma/Postgres `BatchStatus` enum exactly
 * (SCREAMING_SNAKE). Do not reintroduce lowercase wire values — that dual
 * spelling is what made `as never` hide invalid writes.
 *
 * @see packages/prisma/prisma/schema.prisma `enum BatchStatus`
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
export enum BatchStatus {
  PENDING = 'PENDING',
  /** In-progress generation. Same label as Prisma `PROCESSING`. */
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  PARTIAL = 'PARTIAL',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * Per-item status. Values MUST match the Prisma/Postgres `BatchItemStatus`
 * enum exactly (SCREAMING_SNAKE). The payload still lives on `BatchItem.data`
 * / `Batch.items`; status itself is a typed column.
 *
 * @see packages/prisma/prisma/schema.prisma `enum BatchItemStatus`
 */
export enum BatchItemStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

/**
 * Studio Batch project kind (#5463). Values match Prisma `BatchProjectKind`.
 *
 * @see packages/prisma/prisma/schema.prisma `enum BatchProjectKind`
 */
export enum BatchProjectKind {
  IDEAS = 'IDEAS',
  WORKFLOW = 'WORKFLOW',
}

/**
 * Studio Batch project lifecycle. Values match Prisma `BatchProjectStatus`.
 *
 * @see packages/prisma/prisma/schema.prisma `enum BatchProjectStatus`
 */
export enum BatchProjectStatus {
  DRAFT = 'DRAFT',
  GENERATING = 'GENERATING',
  REVIEWING = 'REVIEWING',
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  PARTIAL_FAILURE = 'PARTIAL_FAILURE',
  CANCELLED = 'CANCELLED',
}

/**
 * Per-item state of a Studio Batch project. Values match Prisma
 * `BatchProjectItemStatus`.
 *
 * @see packages/prisma/prisma/schema.prisma `enum BatchProjectItemStatus`
 */
export enum BatchProjectItemStatus {
  PENDING = 'PENDING',
  GENERATING = 'GENERATING',
  READY = 'READY',
  FAILED = 'FAILED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

/**
 * Wizard step a Studio Batch project reopens at. Persisted in the
 * `batch_projects.step` String column as lowercase product vocabulary.
 */
export enum BatchProjectStep {
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
 * Lifecycle of a background Review batch rewrite (#5365). Not persisted in
 * Postgres: the BullMQ job state is the source of truth, so these are API wire
 * values only.
 */
export enum BatchRewriteJobStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  PARTIALLY_FAILED = 'partially_failed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/** Why one item of a background batch rewrite was not rewritten. */
export enum BatchRewriteItemFailureReason {
  /** The draft changed after the rewrite was queued (per-post optimistic lock). */
  CONFLICT = 'conflict',
  INSUFFICIENT_CREDITS = 'insufficient_credits',
  /** Published, publishing, skipped, cancelled, or no longer in the batch. */
  NOT_REWRITABLE = 'not_rewritable',
  GENERATION_FAILED = 'generation_failed',
}
