/** Any surface can ask the shell to re-read the wallet after spending credits. */
export const TOPBAR_BALANCES_REFRESH_EVENT = 'genfeed:topbar-balances:refresh';

/**
 * Asks every mounted balance reader to re-read the wallet. Call it after an
 * action that reserves, settles or releases credits so this tab does not wait
 * for the socket event or the next focus.
 */
export function requestTopbarBalancesRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(TOPBAR_BALANCES_REFRESH_EVENT));
}
