export { Scope as ArticleScope } from './scope.enum';

/**
 * Article lifecycle. Core members match Prisma `ArticleStatus`.
 *
 * `PROCESSING` and `FAILED` are domain-only (pipeline UI) — not Prisma labels.
 * Map to DRAFT/ARCHIVED (or omit) before writing articles.status.
 *
 * @see packages/prisma/prisma/schema.prisma `enum ArticleStatus`
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

export enum ArticleCategory {
  POST = 'post',
  TUTORIAL = 'tutorial',
  GUIDE = 'guide',
  NEWS = 'news',
  ANNOUNCEMENT = 'announcement',
  ANALYSIS = 'analysis',
  REVIEW = 'review',
  INTERVIEW = 'interview',
  TRANSCRIPT = 'transcript',
  WHITEPAPER = 'whitepaper',
  ESSAY = 'essay',
  LISTICLE = 'listicle',
  X_ARTICLE = 'x-article',
}

export enum TranscriptStatus {
  PENDING = 'pending',
  DOWNLOADING = 'downloading',
  TRANSCRIBING = 'transcribing',
  GENERATING_ARTICLE = 'generating-article',
  GENERATED = 'generated',
  FAILED = 'failed',
}
