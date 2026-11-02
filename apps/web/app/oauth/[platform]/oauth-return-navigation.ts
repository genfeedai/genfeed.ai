/**
 * Leaves the OAuth callback for the page the operator started from.
 *
 * A full document load, not a client-side `router.push`: the callback comes
 * back from the provider on a freshly loaded document, and the page behind it
 * (protected shell, brand and session state) must start clean, exactly as a
 * reload does. A client transition from here left Connected accounts on its
 * spinner until the page was reloaded.
 */
export function navigateToReturnPath(path: string): void {
  window.location.assign(path);
}
