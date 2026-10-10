'use client';

import {
  getBrowserTimezone,
  HYDRATION_TIME_ZONE,
} from '@helpers/formatting/timezone/timezone.helper';
import { useSyncExternalStore } from 'react';

/**
 * The OS zone has no change event. Re-reading it when the tab becomes visible
 * again picks up a viewer who travelled or changed their clock settings.
 */
function subscribeToTimeZone(onChange: () => void): () => void {
  if (typeof document === 'undefined') {
    return () => undefined;
  }

  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

function getHydrationTimeZone(): string {
  return HYDRATION_TIME_ZONE;
}

/**
 * Hydration-safe viewer time zone for render paths.
 *
 * The server renders, and the client hydrates, with `HYDRATION_TIME_ZONE`, so
 * formatted dates in the server HTML and the first client render are the same
 * text. React re-renders with the browser's zone right after hydration, and
 * client-side mounts read the browser's zone directly.
 */
export function useViewerTimeZone(): string {
  return useSyncExternalStore(
    subscribeToTimeZone,
    getBrowserTimezone,
    getHydrationTimeZone,
  );
}
