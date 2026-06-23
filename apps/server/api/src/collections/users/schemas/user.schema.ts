import type { User } from '@genfeedai/prisma';

export type { User } from '@genfeedai/prisma';

export interface UserDocument extends User {
  _id: string;
  authProviderId: User['authProviderId'];
  organization?: string | null;
  [key: string]: unknown;
}
