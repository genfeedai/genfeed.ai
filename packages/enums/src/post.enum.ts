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

export enum PostCategory {
  ARTICLE = 'article',
  VIDEO = 'video',
  POST = 'post',
  REEL = 'reel',
  STORY = 'story',
  IMAGE = 'image',
  TEXT = 'text',
}

export enum PostEntityModel {
  INGREDIENT = 'Ingredient',
  ARTICLE = 'Article',
}
