export { Scope as ArticleScope } from './scope.enum';

/**
 * App-level article vocabulary: query params, generation-pipeline states, and
 * inbound write values. `PROCESSING` and `FAILED` are pipeline-only and never
 * persist; the rest are translated on write by `ArticleFilterUtil`.
 *
 * This is **not** the wire value of a serialized article — `articles.status` is
 * a Prisma enum, so reads come back as `PersistedArticleStatus`. Comparing a
 * serialized article against a member of this enum never matches.
 */
export enum ArticleStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
  /** Domain-only pipeline state — not a Prisma ArticleStatus label. */
  PROCESSING = 'PROCESSING',
  /** Domain-only pipeline state — not a Prisma ArticleStatus label. */
  FAILED = 'FAILED',
}

/**
 * The persisted article vocabulary — mirrors the Prisma enum exactly, so it is
 * what every serialized article carries on the wire.
 *
 * @see packages/prisma/prisma/schema.prisma `enum ArticleStatus`
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
export enum PersistedArticleStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export enum ArticleCategory {
  POST = 'post',
  TUTORIAL = 'tutorial',
  GUIDE = 'guide',
  NEWS = 'news',
  ANNOUNCEMENT = 'announcement',
  ANALYSIS = 'analysis',
  REVIEW = 'review',
  INTERVIEW = 'interview',
  ARTICLE = 'article',
  WHITEPAPER = 'whitepaper',
  ESSAY = 'essay',
  LISTICLE = 'listicle',
  LINKEDIN_ARTICLE = 'linkedin-article',
  X_ARTICLE = 'x-article',
}
