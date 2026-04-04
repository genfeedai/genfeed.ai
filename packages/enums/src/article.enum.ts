export { Scope as ArticleScope } from './scope.enum';

export enum ArticleStatus {
  DRAFT = 'draft',
  PROCESSING = 'processing',
  PUBLIC = 'public',
  ARCHIVED = 'archived',
  FAILED = 'failed',
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
