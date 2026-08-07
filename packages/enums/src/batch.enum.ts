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
 * Per-item status stored inside the batch `items` JSON payload (not a Prisma
 * enum column). Still SCREAMING_SNAKE for consistency with BatchStatus.
 */
export enum BatchItemStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

export enum ContentFormat {
  IMAGE = 'image',
  VIDEO = 'video',
  CAROUSEL = 'carousel',
  REEL = 'reel',
  STORY = 'story',
}

/**
 * Reference image category. Values match Prisma `ReferenceImageCategory`
 * (orphan type today — no column yet).
 * @see packages/prisma/prisma/schema.prisma `enum ReferenceImageCategory`
 */
export enum ReferenceImageCategory {
  FACE = 'FACE',
  PRODUCT = 'PRODUCT',
  STYLE = 'STYLE',
  LOGO = 'LOGO',
}
