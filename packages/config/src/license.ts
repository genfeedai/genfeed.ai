import { isSaaS } from './deployment';

/**
 * Enterprise Edition (EE) feature gating for **self-hosted** commercial builds.
 *
 * Core features work without a license key.
 * Self-hosted EE features (multi-tenancy extras, etc.) require a valid key.
 *
 * Do **not** use this alone for SaaS subscription/billing UI. Cloud SaaS always
 * has org billing — use {@link hasOrganizationBilling}.
 */
export function isEEEnabled(): boolean {
  return Boolean(
    process.env.GENFEED_LICENSE_KEY ??
      process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY,
  );
}

/**
 * Whether organization subscription billing is available in this deployment.
 *
 * - **SaaS** (`GENFEED_CLOUD`): always — plan, portal, Stripe subscription.
 * - **Self-hosted EE** (license key): yes — commercial self-host billing.
 * - **Self-hosted community**: no — Credits/managed PAYG only.
 */
export function hasOrganizationBilling(): boolean {
  return isSaaS() || isEEEnabled();
}
