import { isDesktopClient, isSaaS, isSelfHostedDeployment } from './deployment';
import { getLicenseVerificationVerdict } from './license-state';

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
  return getLicenseVerificationVerdict();
}

/**
 * Whether organization subscription billing is available in this deployment.
 *
 * - **SaaS** (`GENFEED_CLOUD` / `NEXT_PUBLIC_GENFEED_CLOUD`, or `*.genfeed.ai`
 *   domain via {@link import('./deployment').isHostedGenfeedCloud}): always —
 *   plan, portal, Stripe subscription. Same rule on frontend and backend.
 * - **Self-hosted EE** (license key): yes — commercial self-host billing.
 * - **Self-hosted community**: no — Credits/managed PAYG only.
 */
export function hasOrganizationBilling(): boolean {
  return isSaaS() || isEEEnabled();
}

/**
 * Cosmetic organization-billing hint for browser and Next.js UI code.
 *
 * The public env value is intentionally presence-only because public bundles
 * cannot verify the server-only license token. Never use this helper for API,
 * provider, authorization, or other enforcement decisions.
 */
export function hasOrganizationBillingHint(): boolean {
  return (
    hasOrganizationBilling() ||
    Boolean(process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY?.trim())
  );
}

/**
 * Whether this deployment enforces a real Genfeed credit ledger (not the OSS
 * infinite-credit stub). Same axes as {@link hasOrganizationBilling}.
 */
export function usesMeteredCredits(): boolean {
  return hasOrganizationBilling();
}

/**
 * Whether Settings / topbar should surface Genfeed **Credits** (packs, balance).
 *
 * - SaaS / EE: yes (metered Genfeed credits).
 * - Community self-host: yes (buy managed Cloud credits; not pure local BYOK).
 * - Desktop: no — local BYOK only; no Genfeed credit wallet in-shell.
 */
export function shouldShowCreditsNav(): boolean {
  if (isDesktopClient()) {
    return false;
  }
  if (hasOrganizationBilling()) {
    return true;
  }
  return isSelfHostedDeployment();
}
