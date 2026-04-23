import type { Customer } from '@genfeedai/prisma';

export type { Customer } from '@genfeedai/prisma';

export interface CustomerDocument extends Customer {
  _id: string;
  organization?: string | null;
  [key: string]: unknown;
}
