import type { User } from '@genfeedai/prisma';

export type { User } from '@genfeedai/prisma';

export interface UserDocument extends User {
  _id: string;
  clerkId: User['clerkId'];
  organization?: string | null;
  [key: string]: unknown;
}
