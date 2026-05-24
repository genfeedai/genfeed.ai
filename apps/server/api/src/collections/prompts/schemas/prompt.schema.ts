import type { Prompt } from '@genfeedai/prisma';

export type { Prompt } from '@genfeedai/prisma';

export interface PromptDocument extends Prompt {
  _id: string;
  article?: string | null;
  brand?: string | null;
  ingredient?: string | null;
  organization?: string | null;
  user?: string | null;
  [key: string]: unknown;
}
