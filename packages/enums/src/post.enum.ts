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
