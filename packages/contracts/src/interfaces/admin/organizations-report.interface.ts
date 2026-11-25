import type { IPaginationParams } from '../core/common.interface';

/**
 * Platform-admin list of every organization on the platform, one row each.
 * `ownerEmail` is the organization owner's login; `memberCount` counts
 * non-deleted memberships. `isOnboardingCompleted` is the same definition the
 * onboarding funnel reports: the organization flag or the owner's flag.
 * `isOwnerEmailVerified` is the owner's stored verification flag and
 * `appSource` the product the owner signed up through.
 */
export interface IOrganizationsReportOrganization {
  appSource: string;
  category: string;
  createdAt: string;
  id: string;
  isDeleted: boolean;
  isOnboardingCompleted: boolean;
  isOwnerEmailVerified: boolean;
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
