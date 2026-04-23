import type { Organization } from '@genfeedai/prisma';

export type { Organization } from '@genfeedai/prisma';

export interface OrganizationDocument extends Organization {
  _id: string;
  name?: string | null;
  user?: string | null;
  [key: string]: unknown;
}
