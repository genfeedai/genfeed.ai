import type { User } from '@genfeedai/prisma';

export type { User } from '@genfeedai/prisma';

export interface UserDocument extends User {
  _id: string;
  organization?: string | null;
  [key: string]: unknown;
}
