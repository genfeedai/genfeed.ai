'use client';

import { useRoutedOrganization } from '@genfeedai/contexts/user/organization-context/organization-context';
import { getPlaywrightAuthState } from '@genfeedai/helpers/auth/auth.helper';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { useEffect } from 'react';
import { readSessionTag } from '@/lib/auth/session-tag';
import { writeBootRecord } from '@/lib/boot-record/boot-record';
import { BOOT_BUILD_ID } from '@/lib/boot-record/use-boot-record';
import type { BootRailSnapshot } from '@/props/layout/boot-record.props';

/**
 * Keeps the device's boot record equal to the rail the server last confirmed.
 *
 * It writes only while the routed organization is confirmed for the signed-in
 * user, and only once the rail's own inputs have loaded (a rail still waiting
 * on settings would be stored as an empty one). Whatever the server has not
 * confirmed is never stored.
 */
export function useBootRecordWriter(
  organizationSlug: string | undefined,
  rail: BootRailSnapshot,
): void {
  const { confirmedOrganizationId, isRouteConfirmed } = useRoutedOrganization();
  const { userId } = useAuthIdentity();
  const effectiveUserId = userId ?? getPlaywrightAuthState()?.userId ?? null;
  const isLoaded =
    rail.installedAppIds !== undefined &&
    rail.moduleAccess != null &&
    rail.modulePreferences != null &&
    rail.releaseVisibility != null;
  const serialized = JSON.stringify(rail);

  // use-effect-audit: ignore writes to browser storage, an outside system
  useEffect(() => {
    // Without a session tag nothing could tie the record to this session.
    const sessionTag = readSessionTag();
    if (
      !isRouteConfirmed ||
      !confirmedOrganizationId ||
      !organizationSlug ||
      !effectiveUserId ||
      !sessionTag ||
      !isLoaded
    ) {
      return;
    }
    writeBootRecord({
      buildId: BOOT_BUILD_ID,
      organizationId: confirmedOrganizationId,
      organizationSlug,
      rail: JSON.parse(serialized) as BootRailSnapshot,
      savedAt: Date.now(),
      sessionTag,
      userId: effectiveUserId,
    });
  }, [
    confirmedOrganizationId,
    effectiveUserId,
    isLoaded,
    isRouteConfirmed,
    organizationSlug,
    serialized,
  ]);
}
