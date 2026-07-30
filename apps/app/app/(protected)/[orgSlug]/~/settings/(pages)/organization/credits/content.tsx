'use client';

import { isSelfHostedDeployment } from '@genfeedai/config/deployment';
import { hasOrganizationBilling } from '@genfeedai/config/license';
import AddCreditsCard from '../billing/add-credits-card';
import ManagedCreditsCheckoutCard from './managed-credits-checkout-card';

/**
 * Credits checkout surface:
 * - SaaS / EE (`hasOrganizationBilling`): org Stripe PAYG against this API.
 * - Community self-host only: managed checkout against Genfeed Cloud (not the
 *   local API) to provision a managed key.
 */
export default function SettingsCreditsPage() {
  const useManagedCloudCheckout =
    isSelfHostedDeployment() && !hasOrganizationBilling();

  return (
    <div className="pb-10">
      <h1 className="sr-only">Credits</h1>
      {useManagedCloudCheckout ? (
        <ManagedCreditsCheckoutCard />
      ) : (
        <AddCreditsCard />
      )}
    </div>
  );
}
