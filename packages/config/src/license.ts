import { isDesktopClient, isSaaS, isSelfHostedDeployment } from './deployment';

/**
 * Enterprise Edition (EE) feature gating for **self-hosted commercial builds**.
 *
 * Core features work without a license key.
 * Self-hosted EE features (multi-tenancy extras, commercial billing packages)
 * require a valid key issued for that deployment.
 *
 * **Genfeed Cloud SaaS (`app.genfeed.ai`) does not use a license key.** Hosted
 * multi-tenant billing is gated by `GENFEED_CLOUD` / {@link isSaaS} and
 * {@link hasOrganizationBilling}. There is no self-serve "generate a license
 * for genfeed.ai itself" path — Cloud is the licensed product; EE keys are for
 * customers running a commercial self-hosted image, issued offline/sales.
 *
 * Do **not** use this alone for SaaS credit metering or subscription DI — use
 * {@link usesMeteredCredits} / {@link hasOrganizationBilling}.
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
 * - **Self-hosted community**: no — BYOK free + optional managed Cloud credits.
 * - **Desktop shell**: no — local BYOK only.
 */
export function hasOrganizationBilling(): boolean {
  return isSaaS() || isEEEnabled();
}

/**
 * Whether this deployment enforces a real Genfeed credit ledger (not the OSS
 * infinite-credit stub).
 *
 * Same axes as {@link hasOrganizationBilling}: Cloud SaaS and licensed EE
 * self-host. Community/Desktop use BYOK (and optional managed Cloud credits
 * via the hosted API), so local `CreditsUtilsService` stays the OSS no-op.
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
