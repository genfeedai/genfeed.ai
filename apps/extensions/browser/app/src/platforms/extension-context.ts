export const STALE_EXTENSION_MESSAGE =
  'Genfeed was updated. Reload this page to keep using it.';

/**
 * Whether a messaging failure means this page still runs the content script of
 * an extension that has since been reloaded or updated. Only a page reload
 * gives the page a working script again.
 */
export function isStaleExtensionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /extension context invalidated/i.test(error.message)
  );
}
