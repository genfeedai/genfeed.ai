import { isGoogleSignInAvailable } from '@genfeedai/auth-client';
import { useSyncExternalStore } from 'react';

function subscribe(): () => void {
  return () => undefined;
}

/**
 * Whether the auth screens may offer Google sign-in. The server render cannot
 * see the runtime config script, so it assumes available and the client
 * corrects it on hydration, without a mismatch error.
 */
export function useIsGoogleSignInAvailable(): boolean {
  return useSyncExternalStore(subscribe, isGoogleSignInAvailable, () => true);
}
