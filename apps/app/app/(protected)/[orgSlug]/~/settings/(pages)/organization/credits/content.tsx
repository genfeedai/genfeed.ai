'use client';

import { isSelfHostedDeployment } from '@genfeedai/config/deployment';
import { hasOrganizationBilling } from '@genfeedai/config/license';
import { EnvironmentService } from '@services/core/environment.service';
import AddCreditsCard from '../billing/add-credits-card';
import ManagedCreditsCheckoutCard from './managed-credits-checkout-card';

/**
 * Credits checkout surface:
 * - Org Stripe PAYG when SaaS/EE **or** a local PAYG price is configured
 *   (local Stripe test against this API).
 * - Managed Genfeed Cloud checkout only for community self-host without PAYG
 *   (buy a managed key from cloud — not the local API).
 */
export default function SettingsCreditsPage() {
  const hasLocalPaygPrice = Boolean(EnvironmentService.plans.payg);
  const useManagedCloudCheckout =
    isSelfHostedDeployment() && !hasOrganizationBilling() && !hasLocalPaygPrice;

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
