import type { ContentDraft } from '@genfeedai/prisma';

export type { ContentDraft } from '@genfeedai/prisma';

export interface ContentDraftDocument extends ContentDraft {
  _id: string;
  brand?: string | null;
  content?: string;
  mediaUrls?: string[];
  metadata?: Record<string, unknown>;
  organization: string;
  platforms?: string[];
  prompt?: string;
  status: ContentDraft['status'];
  title?: string;
  [key: string]: unknown;
}
