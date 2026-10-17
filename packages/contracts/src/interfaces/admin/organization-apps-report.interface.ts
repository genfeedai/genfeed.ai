import type { OrganizationModuleId } from '../../constants/organization-modules.constant';

/**
 * Platform-admin report of which apps each organization currently sees.
 * `isVisible` is what the app shell shows (released to the organization and
 * not switched off by it); the API and MCP ignore the organization's switch.
 */
export interface IOrganizationAppsReportApp {
  isReleased: boolean;
  isVisible: boolean;
}

export interface IOrganizationAppsReportOrganization {
  apps: Record<OrganizationModuleId, IOrganizationAppsReportApp>;
  id: string;
  isReleasePreviewEnabled: boolean;
  label: string;
  releasedItemIds: string[];
  slug: string;
  subscriptionTier: string | null;
}

export interface IOrganizationAppsReport {
  generatedAt: string;
  organizations: IOrganizationAppsReportOrganization[];
  /** `release_<id>` platform flags; a missing flag counts as not released. */
  releaseFlags: Record<string, boolean>;
}
