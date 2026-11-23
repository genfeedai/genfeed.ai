import type { LayoutProps } from '@genfeedai/props/layout/layout.props';

export interface RoutedOrganizationProviderProps extends LayoutProps {
  /**
   * The device's last confirmed copy for the organization in the URL, when it
   * is valid for this build, session and user. The page may be drawn from it
   * while the membership check runs; requests are held until the check names
   * the same organization.
   */
  provisional?: { organizationId: string; userId: string } | null;
  /** Removes what this device kept of a workspace; run when the check refuses the copy. */
  wipeDeviceStores?: () => Promise<void>;
}
