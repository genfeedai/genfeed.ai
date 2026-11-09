import type { AssetScope } from '@genfeedai/contracts';

/** What a website handle claim needs from the API, injectable for tests. */
export interface ClaimHandleClients {
  findBrands: (
    organizationId: string,
  ) => Promise<{ id: string; scope?: AssetScope; slug?: string }[]>;
  findOrganizations: () => Promise<{ id: string; isActive?: boolean }[]>;
  setHandle: (brandId: string, handle: string) => Promise<void>;
}

/**
 * - `claimed`: the brand now answers at `genfeed.ai/@<handle>`.
 * - `unchanged`: it already did.
 * - `kept-public`: the brand already has a live public profile, so its URL
 *   (and every link shared to it) stays; the owner renames it in settings.
 * - `unavailable`: taken, reserved, or the write failed; the brand keeps its
 *   handle and the owner can pick another in brand settings.
 * - `no-brand`: the account has no brand yet to take the handle.
 */
export type ClaimHandleOutcome =
  | 'claimed'
  | 'kept-public'
  | 'no-brand'
  | 'unavailable'
  | 'unchanged';
