'use client';

import { getPlaywrightAuthState } from '@genfeedai/helpers/auth/auth.helper';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { useMemo, useSyncExternalStore } from 'react';
import {
  parseBootRecord,
  readBootRecordText,
  subscribeToBootRecord,
} from '@/lib/boot-record/boot-record';
import type { BootRecord } from '@/props/layout/boot-record.props';

export const BOOT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? 'development';

const readNothing = (): null => null;

/**
 * The record that can paint the rail for `organizationSlug` right now, or
 * null. It is null on the server and during hydration (so the first paint
 * matches the server's HTML), when nothing is stored, when the stored record
 * is for another organization, or when the session has answered and belongs to
 * another user. The membership check still decides what stays: this only
 * chooses what is drawn while it runs.
 */
export function useBootRecord(
  organizationSlug: string | undefined,
): BootRecord | null {
  const text = useSyncExternalStore(
    subscribeToBootRecord,
    readBootRecordText,
    readNothing,
  );
  const { isLoaded, isSignedIn, userId } = useAuthIdentity();
  const playwrightAuth = getPlaywrightAuthState();
  const effectiveUserId = userId ?? playwrightAuth?.userId ?? null;
  const isIdentityKnown =
    isLoaded || playwrightAuth?.isLoaded === true || effectiveUserId !== null;
  const isSignedOut =
    isLoaded && !isSignedIn && playwrightAuth?.isSignedIn !== true;

  return useMemo(() => {
    if (!organizationSlug || isSignedOut) {
      return null;
    }
    const record = parseBootRecord(text, {
      buildId: BOOT_BUILD_ID,
      now: Date.now(),
    });
    if (
      !record ||
      record.organizationSlug !== organizationSlug ||
      (isIdentityKnown && record.userId !== effectiveUserId)
    ) {
      return null;
    }
    return record;
  }, [effectiveUserId, isIdentityKnown, isSignedOut, organizationSlug, text]);
}
