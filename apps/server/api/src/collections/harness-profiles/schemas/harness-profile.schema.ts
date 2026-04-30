import type { IHarnessProfile } from '@genfeedai/interfaces';
import type { Profile as PrismaProfile } from '@genfeedai/prisma';

export type HarnessProfileData = Omit<
  IHarnessProfile,
  | '_id'
  | 'createdAt'
  | 'createdBy'
  | 'createdById'
  | 'id'
  | 'isDeleted'
  | 'organization'
  | 'organizationId'
  | 'updatedAt'
>;

export interface HarnessProfileDocument
  extends PrismaProfile,
    HarnessProfileData {
  _id: string;
  organization?: string;
  createdBy?: string | null;
}
