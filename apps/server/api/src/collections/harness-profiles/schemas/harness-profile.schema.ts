import type { IHarnessProfile } from '@genfeedai/contracts/interfaces';
import type { HarnessProfile as PrismaHarnessProfile } from '@genfeedai/prisma';

export type HarnessProfileData = Omit<
  IHarnessProfile,
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
  extends Omit<
      PrismaHarnessProfile,
      | 'brandId'
      | 'content'
      | 'currentVersion'
      | 'description'
      | 'isDefault'
      | 'label'
      | 'scope'
      | 'status'
    >,
    HarnessProfileData {}
