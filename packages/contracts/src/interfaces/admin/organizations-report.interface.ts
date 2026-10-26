import type { IPaginationParams } from '../core/common.interface';

/**
 * Platform-admin list of every organization on the platform, one row each.
 * `ownerEmail` is the organization owner's login; `memberCount` counts
 * non-deleted memberships.
 */
export interface IOrganizationsReportOrganization {
  category: string;
  createdAt: string;
  id: string;
  isDeleted: boolean;
  isOnboardingCompleted: boolean;
  label: string;
  memberCount: number;
  ownerEmail: string | null;
  slug: string;
  subscriptionTier: string | null;
}

export interface IOrganizationsReport {
  generatedAt: string;
  organizations: IOrganizationsReportOrganization[];
  /** Which page of organizations this report carries, with the total. */
  pagination: IPaginationParams;
}
