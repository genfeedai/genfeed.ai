import type { Member } from '@genfeedai/prisma';

export type { Member } from '@genfeedai/prisma';

export interface MemberDocument extends Member {
  _id: string;
  organization?: string | null;
  role?: string | null;
  user?: string | null;
}
