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
