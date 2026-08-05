import type { Tag } from '@genfeedai/prisma';

export type { Tag } from '@genfeedai/prisma';

export interface TagDocument extends Tag {
  text?: string | null;
  [key: string]: unknown;
}
