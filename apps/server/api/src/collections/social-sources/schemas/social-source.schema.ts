import type { SourcePostDocument } from '@api/collections/source-posts/schemas/source-post.schema';
import type { SocialSource } from '@genfeedai/prisma';

export type SocialSourceDocument = SocialSource & {
  _id?: string;
  brand?: string | { id?: string } | null;
  credential?: string | { id?: string } | null;
  organization?: string | { id?: string } | null;
  user?: string | { id?: string } | null;
};

export interface SocialSourceSyncDocumentResult {
  count: number;
  posts: SourcePostDocument[];
  source: SocialSourceDocument;
}

export interface SocialSourceBrandSyncDocumentResult {
  count: number;
  failures: Array<{ error: string; sourceId: string }>;
  results: SocialSourceSyncDocumentResult[];
}
