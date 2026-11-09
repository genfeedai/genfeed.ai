/** What a website handle claim needs from the API, injectable for tests. */
export interface ClaimHandleClients {
  findBrands: (
    organizationId: string,
  ) => Promise<{ id: string; slug?: string }[]>;
  findOrganizations: () => Promise<{ id: string; isActive?: boolean }[]>;
  setHandle: (brandId: string, handle: string) => Promise<void>;
}

/**
 * - `claimed`: the brand now answers at `genfeed.ai/@<handle>`.
 * - `unchanged`: it already did.
 * - `unavailable`: taken, reserved, or the write failed; the brand keeps its
 *   handle and the owner can pick another in brand settings.
 * - `no-brand`: the account has no brand yet to take the handle.
 */
export type ClaimHandleOutcome =
  | 'claimed'
  | 'no-brand'
  | 'unavailable'
  | 'unchanged';
