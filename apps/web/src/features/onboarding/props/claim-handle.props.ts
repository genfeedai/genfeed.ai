import type { AssetScope } from '@genfeedai/contracts';

/** What a website handle claim needs from the API, injectable for tests. */
export interface ClaimHandleClients {
  findBrands: (
    organizationId: string,
  ) => Promise<{ id: string; scope?: AssetScope; slug?: string }[]>;
  findOrganizations: () => Promise<{ id: string; isActive?: boolean }[]>;
  setHandle: (brandId: string, handle: string) => Promise<void>;
}

/** The signed-in account a claim would apply to. */
export interface ClaimHandleAccount {
  isOnboardingCompleted: boolean;
}

/**
 * - `claimed`: the brand now answers at `genfeed.ai/@<handle>`.
 * - `unchanged`: it already did.
 * - `existing-account`: the account finished onboarding before this claim, so
 *   no brand is renamed from a link; the owner changes it in brand settings.
 * - `kept-public`: the brand already has a live public profile, so its URL
 *   (and every link shared to it) stays; the owner renames it in settings.
 * - `several-brands`: the organization has more than one brand, so the owner
 *   picks which one takes the handle in brand settings.
 * - `unavailable`: taken, reserved, or the write failed; the brand keeps its
 *   handle and the owner can pick another in brand settings.
 * - `no-brand`: the account has no brand yet to take the handle.
 */
export type ClaimHandleOutcome =
  | 'claimed'
  | 'existing-account'
  | 'kept-public'
  | 'no-brand'
  | 'several-brands'
  | 'unavailable'
  | 'unchanged';
