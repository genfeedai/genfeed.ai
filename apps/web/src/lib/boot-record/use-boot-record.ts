'use client';

import { getPlaywrightAuthState } from '@genfeedai/helpers/auth/auth.helper';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { useMemo, useSyncExternalStore } from 'react';
import { readSessionTag } from '@/lib/auth/session-tag';
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
 * is for another organization, when it was written under another session than
 * the one the page was served for (the session tag in the cookie), or when the
 * session has answered and belongs to another user. The tag decides before the
 * session answers: a record is never drawn on the strength of "nobody has said
 * otherwise yet". A failed session read changes nothing: the tag still decides.
 * The membership check still decides what stays: this only chooses what is
 * drawn while it runs.
 */
export function useBootRecord(
  organizationSlug: string | undefined,
): BootRecord | null {
  const text = useSyncExternalStore(
    subscribeToBootRecord,
    readBootRecordText,
    readNothing,
  );
  const { hasSessionReadFailed, isLoaded, isSignedIn, userId } =
    useAuthIdentity();
  const playwrightAuth = getPlaywrightAuthState();
  const effectiveUserId = userId ?? playwrightAuth?.userId ?? null;
  const isSignedOut =
    isLoaded &&
    !isSignedIn &&
    !hasSessionReadFailed &&
    playwrightAuth?.isSignedIn !== true;

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
      record.sessionTag !== readSessionTag() ||
      record.organizationSlug !== organizationSlug ||
      // Whoever the session names must be the user the record was kept for.
      // With no user named (not answered, or the read failed) the tag decides.
      (effectiveUserId !== null && record.userId !== effectiveUserId)
    ) {
      return null;
    }
    return record;
  }, [effectiveUserId, isSignedOut, organizationSlug, text]);
}
