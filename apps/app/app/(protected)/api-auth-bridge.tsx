'use client';

import type { AuthTokenGetter } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useEffect } from 'react';
import { registerApiAuthTokenGetter } from '@/lib/api/client';

/**
 * Binds the signed-in session's token resolver to the workflow-builder API
 * client (`@/lib/api/client`) for the lifetime of the protected shell.
 *
 * Registration happens during render rather than in an effect: child effects
 * run before a parent's, so a page that fetches on mount would otherwise issue
 * its first request unauthenticated. Re-registering the same resolver is
 * idempotent, which keeps it safe under StrictMode's double render.
 */
export default function ApiAuthBridge() {
  const { getToken } = useAuthIdentity();

  registerApiAuthTokenGetter(getToken as AuthTokenGetter);

  useEffect(() => {
    return () => registerApiAuthTokenGetter(null);
  }, []);

  return null;
}
