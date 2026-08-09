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
 * How a post is repurposed to another channel. Product-language lowercase on
 * purpose: the mode is a request discriminator, never a persisted DB status.
 */
export enum PostRepurposeMode {
  AGENT = 'agent',
  DETERMINISTIC = 'deterministic',
}

export enum PostFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
  NEVER = 'never',
}

/**
 * Editorial shape of a social post. Thread segments remain canonical Post
 * records linked through `parentId`; this field records the intended editing
 * and publishing experience without duplicating their bodies into JSON.
 */
export enum PostFormat {
  STANDARD = 'standard',
  LONG_FORM = 'long-form',
  THREAD = 'thread',
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
