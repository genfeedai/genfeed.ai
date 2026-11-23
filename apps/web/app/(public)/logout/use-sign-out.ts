'use client';

import { signOut } from '@genfeedai/auth-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { resetAnalytics } from '@/lib/analytics';
import { wipeDeviceStores } from '@/lib/device-stores/device-stores';

export type SignOutPhase = 'running' | 'done' | 'failed';

/** The first request plus one retry, then the user is told. */
const SIGN_OUT_ATTEMPTS = 2;

async function requestSignOut(): Promise<boolean> {
  try {
    const result = await signOut();
    return !result?.error;
  } catch {
    return false;
  }
}

/**
 * Ends the session while the sign-in page is already on screen (#10933).
 *
 * The device state goes first and at once. The request then runs, is retried
 * once, and settles as `done` or `failed`; the host keeps the sign-in actions
 * locked until it settles, so a new sign-in cannot race the old session's
 * removal. The address stays `/logout`: the analytics sync ignores that route,
 * so a session atom that has not caught up yet cannot identify the user again.
 */
export function useSignOut(): { phase: SignOutPhase; retry: () => void } {
  const [phase, setPhase] = useState<SignOutPhase>('running');
  const isUnmountedRef = useRef(false);

  const run = useCallback(async (): Promise<void> => {
    for (let attempt = 0; attempt < SIGN_OUT_ATTEMPTS; attempt += 1) {
      if (await requestSignOut()) {
        if (!isUnmountedRef.current) {
          setPhase('done');
        }
        return;
      }
    }

    if (!isUnmountedRef.current) {
      setPhase('failed');
    }
  }, []);

  // use-effect-audit: ignore ends the session, an external system
  useEffect(() => {
    isUnmountedRef.current = false;

    // Nothing of the session stays on a shared device, whatever the request
    // does next.
    resetAnalytics();
    void wipeDeviceStores();
    void run();

    return () => {
      isUnmountedRef.current = true;
    };
  }, [run]);

  const retry = useCallback(() => {
    setPhase('running');
    void run();
  }, [run]);

  return { phase, retry };
}
