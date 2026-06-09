import type { ContentDraft } from '@genfeedai/prisma';

export type { ContentDraft } from '@genfeedai/prisma';

// content / mediaUrls / metadata / platforms are now real ContentDraft columns
// (see schema.prisma) — no longer redeclared here. Only Mongo-era aliases that have
// no Prisma column remain.
export interface ContentDraftDocument extends ContentDraft {
  _id: string;
  brand?: string | null;
  organization: string;
  prompt?: string;
  title?: string;
  [key: string]: unknown;
}
