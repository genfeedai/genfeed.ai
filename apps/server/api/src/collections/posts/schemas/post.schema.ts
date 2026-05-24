import type { Post } from '@genfeedai/prisma';

export type { Post } from '@genfeedai/prisma';

export interface PostDocument extends Post {
  _id: string;
  brand: string;
  content?: string;
  mediaUrls?: string[];
  metadata?: Record<string, unknown>;
  organization: string;
  user: string;
  [key: string]: unknown;
}
