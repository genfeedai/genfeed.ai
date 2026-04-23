import type { ProcessedTweet } from '@genfeedai/prisma';

export type { ProcessedTweet } from '@genfeedai/prisma';

export interface ProcessedTweetDocument extends ProcessedTweet {
  _id: string;
}
