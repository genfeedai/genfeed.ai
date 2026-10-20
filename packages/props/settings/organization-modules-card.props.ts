import type { OrganizationModuleId } from '@genfeedai/contracts/constants';
import type { IconComponent } from '@genfeedai/contracts/types/icon';

/** One module card on Settings → Modules, laid out like a Store app card. */
export interface OrganizationModuleTileProps {
  moduleId: OrganizationModuleId;
  description: string;
  icon: IconComponent;
  label: string;
  /** Whether the module's app is shown to the organization's members. */
  isShown: boolean;
  isDisabled: boolean;
  /**
   * Cloud only: a paid module on an organization without a paid plan. The
   * app never appears in the rail then, so the tile offers the subscription
   * instead of a switch.
   */
  isSubscriptionRequired: boolean;
  /** Where the subscription upsell links; absent for members who cannot manage billing. */
  subscriptionHref?: string;
  /** Cloud only: the module needs a paid plan to start new work. */
  isPaid: boolean;
  onShownChange: (isShown: boolean) => void;
}
