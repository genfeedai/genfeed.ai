import type { SourcePostDocument } from '@api/collections/source-posts/schemas/source-post.schema';
import type { SocialSource } from '@genfeedai/prisma';

export type SocialSourceDocument = SocialSource;

export interface SocialSourceSyncDocumentResult {
  count: number;
  posts: SourcePostDocument[];
  /** Which collector fulfilled the sync (brand-oauth, app-bearer, apify). */
  provider?: string;
  rejectedCount: number;
  source: SocialSourceDocument;
}

export interface SocialSourceBrandSyncDocumentResult {
  count: number;
  failures: Array<{ error: string; sourceId: string }>;
  results: SocialSourceSyncDocumentResult[];
}

export interface SocialPostImportDocumentResult {
  deduplicated: boolean;
  post: SourcePostDocument;
  source: SocialSourceDocument;
}
