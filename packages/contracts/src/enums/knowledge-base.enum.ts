import { Scope } from './scope.enum';

export enum KnowledgeBaseStatus {
  DRAFT = 'draft',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum KnowledgeBaseCategory {
  URL = 'url',
  VIDEO = 'video',
  DOCUMENT = 'document',
  AUDIO = 'audio',
  RSS = 'rss',
  FILE = 'file',
}

export const KnowledgeBaseScope = {
  BRAND: Scope.BRAND,
  ORGANIZATION: Scope.ORGANIZATION,
} as const;

export type KnowledgeBaseScope =
  (typeof KnowledgeBaseScope)[keyof typeof KnowledgeBaseScope];
