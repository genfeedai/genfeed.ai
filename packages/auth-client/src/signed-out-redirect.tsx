'use client';

import { useEffect } from 'react';

import { authClient, clearBetterAuthTokenCache } from './client';
import { watchSignedOut } from './signed-out-sync';

interface SignedOutRedirectProps {
  /** Where a tab goes once the visitor has signed out, in this or any tab. */
  href: string;
}

/**
 * Sends the protected shell to sign-in as soon as the visitor signs out.
 *
 * Mounted next to `SessionKeepAlive`. Without it a tab left open when the
 * visitor signs out elsewhere keeps its cached token and its pollers, and
 * every request it makes after that fails (403 on media, 404 on runs). The
 * redirect is a full navigation so no query cache or timer survives it.
 *
 * Renders nothing.
 */
export function SignedOutRedirect({ href }: SignedOutRedirectProps): null {
  // use-effect-audit: ignore subscribes to the session store and the cross-tab sign-out broadcast
  useEffect(
    () =>
      watchSignedOut({
        onSignedOut: () => {
          clearBetterAuthTokenCache();
          window.location.replace(href);
        },
        subscribeSession: (listener) =>
          authClient.$store.atoms.session?.subscribe(listener) ?? (() => {}),
      }),
    [href],
  );

  return null;
}
