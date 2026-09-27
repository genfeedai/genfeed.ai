'use client';

import { useEffect, useState } from 'react';

/** How long the browser may defer the check before it runs anyway. */
const SESSION_IDLE_TIMEOUT_MS = 3000;

/** Fallback delay for engines without `requestIdleCallback` (Safari). */
const SESSION_IDLE_FALLBACK_MS = 1500;

/**
 * Whether the visitor is signed in, resolved once the page is idle.
 *
 * The marketing header needs one bit — show "Log in" or "App" — and
 * `useAuthIdentity()` paid for it with the whole Better Auth client in every
 * page's first-load bundle plus a session request during hydration. This
 * defers both: the client arrives as a lazy chunk after the page is usable,
 * and the answer is `false` until then, which is what almost every visitor to
 * a marketing page is anyway.
 */
export function useDeferredIsSignedIn(): boolean {
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const check = () => {
      void import('@genfeedai/auth-client')
        .then(({ getSession }) =>
          getSession({ fetchOptions: { signal: controller.signal } }),
        )
        .then((result) => {
          if (!controller.signal.aborted) {
            setIsSignedIn(Boolean(result?.data?.session));
          }
        })
        .catch(() => {
          // The signed-out header is the safe answer when the check fails.
        });
    };

    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(check, {
        timeout: SESSION_IDLE_TIMEOUT_MS,
      });
      return () => {
        controller.abort();
        window.cancelIdleCallback(handle);
      };
    }

    const timeout = window.setTimeout(check, SESSION_IDLE_FALLBACK_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, []);

  return isSignedIn;
}
