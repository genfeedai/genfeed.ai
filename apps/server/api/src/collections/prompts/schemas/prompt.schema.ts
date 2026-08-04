import type { Prompt } from '@genfeedai/prisma';

export type { Prompt } from '@genfeedai/prisma';

export interface PromptDocument extends Prompt {
  _id: string;
  ingredients?: unknown[];
  [key: string]: unknown;
}
