'use client';

import { useRoutedOrganization } from '@genfeedai/contexts/user/organization-context/organization-context';
import { getPlaywrightAuthState } from '@genfeedai/helpers/auth/auth.helper';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { useEffect } from 'react';
import {
  clearBootRecord,
  readBootRecordUserId,
} from '@/lib/boot-record/boot-record';
import { clearPersistedQueryCache } from '@/lib/query-cache/persisted-query-cache';

/**
 * Wipes what the device kept of a workspace the server no longer confirms.
 *
 * The check wins over the record: when the organization in the URL is refused
 * (membership removed, organization gone), when the session ended, or when the
 * session belongs to someone other than the user the record was kept for, the
 * boot record and the device query cache go. A failed read (network, 5xx) is
 * not a refusal and keeps them.
 */
export default function BootRecordGuard() {
  const { status } = useRoutedOrganization();
  const { isLoaded, isSignedIn, userId } = useAuthIdentity();
  const playwrightAuth = getPlaywrightAuthState();
  const effectiveUserId = userId ?? playwrightAuth?.userId ?? null;
  const isSignedOut =
    isLoaded && !isSignedIn && playwrightAuth?.isSignedIn !== true;

  // use-effect-audit: ignore removes records from browser storage, an outside system
  useEffect(() => {
    const storedUserId = readBootRecordUserId();
    const isRefused = status === 'unauthorized';
    const isOtherUser =
      storedUserId !== null &&
      effectiveUserId !== null &&
      storedUserId !== effectiveUserId;

    if (!isRefused && !isSignedOut && !isOtherUser) {
      return;
    }
    clearBootRecord();
    void clearPersistedQueryCache();
  }, [effectiveUserId, isSignedOut, status]);

  return null;
}
