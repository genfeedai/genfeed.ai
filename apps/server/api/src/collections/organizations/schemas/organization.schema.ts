import type { Organization } from '@genfeedai/prisma';

export type { Organization } from '@genfeedai/prisma';

export type OrganizationDocument = Organization & {
  /** Resolved from the organization logo ingredient for list responses. */
  logoUrl?: string;
};
