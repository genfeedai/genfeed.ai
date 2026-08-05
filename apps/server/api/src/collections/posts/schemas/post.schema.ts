import type { Post } from '@genfeedai/prisma';

export type { Post } from '@genfeedai/prisma';

export interface PostDocument extends Omit<Post, 'credentialId' | 'platform'> {
  content?: string;
  credentialId: string | null;
  mediaUrls?: string[];
  metadata?: Record<string, unknown>;
  platform: string | null;
  [key: string]: unknown;
}
