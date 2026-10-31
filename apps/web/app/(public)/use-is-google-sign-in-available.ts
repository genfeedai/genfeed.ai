import { isGoogleSignInAvailable } from '@genfeedai/auth-client';
import { useSyncExternalStore } from 'react';

function subscribe(): () => void {
  return () => undefined;
}

/** Keep Google hidden during SSR until the browser reads the runtime capability. */
export function useIsGoogleSignInAvailable(): boolean {
  return useSyncExternalStore(subscribe, isGoogleSignInAvailable, () => false);
}
