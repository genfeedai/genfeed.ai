import type {
  OrganizationModuleAccess,
  OrganizationModuleId,
} from '../../constants/organization-modules.constant';
import type {
  NativeAppContextualEntry,
  NativeAppReleaseEligibility,
  NativeSecondaryAppId,
} from '../../types/native-app';

/** A native app's catalog identity (#5502). Never an access grant. */
export interface NativeAppCatalogEntry {
  /** One-word visible name used by the launcher, Store and search. */
  label: string;
  /** The organization module whose access governs new work in this app. */
  organizationModuleId: OrganizationModuleId;
  purpose: string;
  releaseEligibility: NativeAppReleaseEligibility;
  /** Actions on existing content that open this app with its source. */
  contextualEntries: readonly NativeAppContextualEntry[];
}

export interface NativeAppAvailabilityInput {
  appId: NativeSecondaryAppId;
  /** From `resolveOrganizationModulePresentationAccess`; null is unresolved. */
  organizationAccess: OrganizationModuleAccess | null | undefined;
  /** Existing operator authorization (platform super admin), never an email. */
  isFounderOperator: boolean;
  installedAppIds: readonly string[];
  pinnedAppIds: readonly string[];
}

/** The caller's personal app activation in their current organization. */
export interface MemberAppsResponse {
  installedAppIds: NativeSecondaryAppId[];
}
