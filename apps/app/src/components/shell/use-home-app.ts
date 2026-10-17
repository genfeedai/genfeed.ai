'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  DEFAULT_HOME_APP_ID,
  resolveHomeAppId,
} from '@genfeedai/contracts/constants';
import { getRailAppRoute } from '@ui/shell/app-rail/app-rail.registry';
import { useCallback, useEffect, useState } from 'react';
import { useRailPreferencesContext } from '@/components/shell/rail-preferences.provider';
import { useAvailableRailApps } from '@/components/shell/use-available-rail-apps';

/**
 * Longest the landing waits for the member's saved choice and what they can
 * open. Past it the home app falls back to the best answer so far, so a slow
 * settings read never strands anyone on a blank page.
 */
const HOME_APP_RESOLUTION_TIMEOUT_MS = 2_000;

/**
 * The app this member lands on: their own choice, else the organization's,
 * else Workspace, skipping a choice they cannot open right now. `isResolved`
 * is false while that answer is still loading, so a redirect can wait for it
 * instead of flashing Workspace first.
 */
export function useHomeApp() {
  const { settings } = useBrand();
  const { homeAppId: userHomeAppId, isLoaded } = useRailPreferencesContext();
  const { apps, isReady } = useAvailableRailApps();
  const [hasTimedOut, setHasTimedOut] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setHasTimedOut(true),
      HOME_APP_RESOLUTION_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timeout);
  }, []);

  const appId = resolveHomeAppId({
    availableAppIds: apps.map((app) => app.id),
    organizationHomeAppId: settings?.defaultHomeAppId,
    userHomeAppId,
  });
  const isResolved = (isReady && isLoaded) || hasTimedOut;

  /** Where the home app opens in a brand, or in the organization without one. */
  const resolveHref = useCallback(
    (orgSlug: string, brandSlug?: string) =>
      getRailAppRoute(appId, orgSlug, brandSlug) ??
      getRailAppRoute(DEFAULT_HOME_APP_ID, orgSlug, brandSlug) ??
      '/',
    [appId],
  );

  return { appId, isResolved, resolveHref };
}
