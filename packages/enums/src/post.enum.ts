export enum PostStatus {
  PUBLIC = 'public',
  PRIVATE = 'private',
  UNLISTED = 'unlisted',
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  PROCESSING = 'processing',
  PENDING = 'pending',
  FAILED = 'failed',
}

/**
 * Audience visibility of a published channel target.
 *
 * This is deliberately independent from `TargetExecutionState`: a target can
 * be `published` with any visibility supported by its provider.
 */
export enum PostVisibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
  UNLISTED = 'unlisted',
}

export enum PostFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
  NEVER = 'never',
}

/**
 * Post category. Values match Prisma `PostCategory`.
 * @see packages/prisma/prisma/schema.prisma `enum PostCategory`
 */
export enum PostCategory {
  ARTICLE = 'ARTICLE',
  VIDEO = 'VIDEO',
  POST = 'POST',
  REEL = 'REEL',
  STORY = 'STORY',
  IMAGE = 'IMAGE',
  TEXT = 'TEXT',
}

/**
 * Post entity model. Values match Prisma `PostEntityModel`.
 * @see packages/prisma/prisma/schema.prisma `enum PostEntityModel`
 */
export enum PostEntityModel {
  INGREDIENT = 'INGREDIENT',
  ARTICLE = 'ARTICLE',
}

/**
 * Review outcome recorded on the canonical Post. Values match Prisma
 * `ReviewDecision` exactly.
 *
 * `posts.reviewDecision` is a Postgres enum column, so these are Prisma labels.
 * The batch review surface (`batches.items[]` and `posts.reviewEvents`, both
 * `Json`) carries a separate lowercase vocabulary — `approved` / `rejected` /
 * `request_changes` — which stays as it is. Two vocabularies on purpose: only
 * the column is enum-typed by Postgres.
 *
 * @see packages/prisma/prisma/schema.prisma `enum ReviewDecision`
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
export const ReviewDecision = {
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  REQUEST_CHANGES: 'REQUEST_CHANGES',
} as const;

export type ReviewDecision =
  (typeof ReviewDecision)[keyof typeof ReviewDecision];
