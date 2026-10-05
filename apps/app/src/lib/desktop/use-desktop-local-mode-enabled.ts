'use client';

import {
  IS_DESKTOP_LOCAL_MODE_ENABLED,
  isDesktopLocalModeEnabled,
} from '@genfeedai/contracts/desktop';
import { useSyncExternalStore } from 'react';

const subscribeNever = (): (() => void) => () => undefined;
const getServerSnapshot = (): boolean => IS_DESKTOP_LOCAL_MODE_ENABLED;

const getClientHydrated = (): boolean => true;
const getServerHydrated = (): boolean => false;

/** True only while hydration commits the server snapshot of the gate. */
export function useIsDesktopLocalModeHydrating(): boolean {
  return !useSyncExternalStore(
    subscribeNever,
    getClientHydrated,
    getServerHydrated,
  );
}

/**
 * Hydration-safe read of the local-mode gate: the server and the first client
 * render use the build constant, then the client re-reads the real gate (which
 * a test harness may have overridden before load).
 */
export function useDesktopLocalModeEnabled(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    isDesktopLocalModeEnabled,
    getServerSnapshot,
  );
}
