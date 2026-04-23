import type { Tag } from '@genfeedai/prisma';

export type { Tag } from '@genfeedai/prisma';

export interface TagDocument extends Tag {
  _id: string;
  brand?: string | null;
  organization?: string | null;
  text?: string | null;
  user?: string | null;
  [key: string]: unknown;
}
