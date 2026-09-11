'use client';

import {
  isDesktopClient,
  isDesktopShellBuild,
} from '@genfeedai/config/deployment';
import { useSyncExternalStore } from 'react';

const subscribeToClientSurface = () => () => {};
const getDesktopClientSnapshot = () => isDesktopClient();
const getDesktopClientServerSnapshot = () => isDesktopShellBuild();

/**
 * Hydration-safe `isDesktopClient()` for render paths.
 *
 * The hosted studio inside the desktop shell only learns it is desktop from the
 * runtime config script, so the server renders the web surface. Reading
 * `isDesktopClient()` during render made the first client render disagree with
 * that HTML (a hydration error on every protected page). Hydration starts from
 * the server's answer; React re-renders with the desktop surface right after.
 */
export function useIsDesktopClient(): boolean {
  return useSyncExternalStore(
    subscribeToClientSurface,
    getDesktopClientSnapshot,
    getDesktopClientServerSnapshot,
  );
}
