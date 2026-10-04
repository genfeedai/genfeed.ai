import type { TagScope } from '@genfeedai/contracts';
import type { Tag } from '@genfeedai/prisma';

export type { Tag } from '@genfeedai/prisma';

export interface TagDocument extends Tag {
  text?: string | null;
  /** Derived from the owner columns on Library tag lists. */
  scope?: TagScope;
  /** Assets carrying the tag in the requested brand; Library tag lists only. */
  assetCount?: number;
  [key: string]: unknown;
}
