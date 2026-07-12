import type { DashboardLayout } from '@genfeedai/prisma';

export class DashboardLayoutEntity implements DashboardLayout {
  id!: string;
  organizationId!: string;
  brandId!: string;
  pageKey!: string;
  document!: DashboardLayout['document'];
  version!: number;
  isDeleted!: boolean;
  createdAt!: Date;
  updatedAt!: Date;

  [key: string]: unknown;

  constructor(partial: Partial<DashboardLayout> = {}) {
    Object.assign(this, partial);
  }
}
