'use client';

import { useSyncExternalStore } from 'react';

const MAC_PLATFORM_PATTERN = /mac/i;

type UserAgentDataCapable = Navigator & {
  userAgentData?: { platform?: string };
};

/** The device is a Mac, from the browser's platform string. */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const platform =
    (navigator as UserAgentDataCapable).userAgentData?.platform ??
    navigator.platform ??
    '';

  return MAC_PLATFORM_PATTERN.test(platform);
}

const subscribeToPlatform = () => () => {};
const getServerSnapshot = () => false;

/**
 * Hydration-safe `isMacPlatform()` for render paths: the server renders as not
 * a Mac, and React re-renders with the real answer right after hydration.
 */
export function useIsMacBrowser(): boolean {
  return useSyncExternalStore(
    subscribeToPlatform,
    isMacPlatform,
    getServerSnapshot,
  );
}
