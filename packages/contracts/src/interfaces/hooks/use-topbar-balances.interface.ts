import type { ITopbarBalanceSegment } from '../index';

/**
 * Shape cached under the shared topbar-balances query key.
 *
 * The genfeed wallet is split out from the provider segments because live
 * socket events carry only that one number: they must be able to update it
 * without inventing the rest of a segment record.
 */
export interface TopbarBalancesSnapshot {
  genfeedBalance: number | null;
  segments: ITopbarBalanceSegment[];
}

export interface UseTopbarBalancesReturn {
  /**
   * Genfeed wallet balance exactly as the API reported it. `null` covers both
   * "not fetched yet" and "provider reported no balance" — read `isLoaded` to
   * tell them apart, because a consumer that renders 0 for the first case
   * shows an empty wallet before the response lands.
   */
  genfeedBalance: number | null;
  /** True once a response (or a live socket balance) has populated the cache. */
  isLoaded: boolean;
  /** True while a request is in flight, including the very first one. */
  isLoading: boolean;
  /** Publish a socket-delivered balance to every consumer of the shared cache. */
  publishGenfeedBalance: (balance: number) => void;
  refresh: () => Promise<void>;
  /** Every provider segment the API returned, genfeed included. */
  segments: ITopbarBalanceSegment[];
}
