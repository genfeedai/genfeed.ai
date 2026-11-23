import { getSession } from '@genfeedai/auth-client';
import { resolveAuthContinuation } from '@genfeedai/auth-client/callback';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { clearBootRecord } from '@/lib/boot-record/boot-record';
import { clearPersistedQueryCache } from '@/lib/query-cache/persisted-query-cache';

/**
 * Where a visitor with no session goes from `destination`: the sign-in page,
 * carrying the page they were heading to when it is a safe in-app path.
 */
export function buildLoginRedirectHref(destination: string): string {
  const continuation = resolveAuthContinuation(destination);

  return continuation?.startsWith('/') && continuation !== '/'
    ? `${APP_ROUTES.LOGIN}?callbackUrl=${encodeURIComponent(continuation)}`
    : APP_ROUTES.LOGIN;
}

/**
 * Sends a visitor whose session the API does not know to sign-in.
 *
 * The route proxy used to do this for every scoped page load, after an API
 * round trip it made before the document left the server (a stale session
 * cookie got a redirect). The proxy no longer calls the API for a page that
 * names its workspace, so the browser decides, once its own session read
 * answers "no session".
 *
 * A failed read is not an answer: a network blip must never sign anyone out,
 * so only a successful response that holds no session redirects.
 */
export async function redirectToLoginWithoutSession(
  signal: AbortSignal,
): Promise<boolean> {
  const result = await getSession();

  if (signal.aborted || result?.error || result?.data?.session) {
    return false;
  }

  // A session that ended elsewhere leaves nothing of it on this device.
  clearBootRecord();
  await clearPersistedQueryCache();
  window.location.replace(
    buildLoginRedirectHref(
      `${window.location.pathname}${window.location.search}`,
    ),
  );
  return true;
}
