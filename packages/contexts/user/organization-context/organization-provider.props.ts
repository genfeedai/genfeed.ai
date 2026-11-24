import type { LayoutProps } from '@genfeedai/props/layout/layout.props';

/**
 * The device's last confirmed copy for the organization in the URL, when it
 * is valid for this build, session and user. The page may be drawn from it
 * while the membership check runs; requests are held until the check names
 * the same organization.
 */
type ProvisionalOrganizationCopy = {
  organizationId: string;
  userId: string;
};

/**
 * A copy comes with the way to remove it: a refusal that cannot wipe the
 * device would leave the refused copy for the next load.
 */
type ProvisionalOrganizationProps =
  | {
      provisional?: null;
      /** Removes what this device kept of a workspace. */
      wipeDeviceStores?: () => Promise<void>;
    }
  | {
      provisional: ProvisionalOrganizationCopy;
      /** Removes what this device kept of a workspace; run when the check refuses the copy. */
      wipeDeviceStores: () => Promise<void>;
    };

export type RoutedOrganizationProviderProps = LayoutProps &
  ProvisionalOrganizationProps;
