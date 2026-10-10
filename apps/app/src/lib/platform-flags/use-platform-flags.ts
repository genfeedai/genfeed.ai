'use client';

import { PLATFORM_FLAG_KEYS } from '@genfeedai/contracts/constants';
import type { IPlatformFlags } from '@genfeedai/contracts/interfaces';
import { logger } from '@services/core/logger.service';
import { PublicService } from '@services/external/public.service';
import { useEffect, useState } from 'react';
import {
  PLATFORM_FLAGS_REFRESH_INTERVAL_MS,
  subscribePlatformFlagsChanged,
} from './platform-flags-sync';

const UNRESOLVED_FLAGS: IPlatformFlags = Object.freeze(
  Object.fromEntries(PLATFORM_FLAG_KEYS.map((key) => [key, false])),
) as IPlatformFlags;

interface PlatformFlagsState {
  flags: IPlatformFlags;
  isReady: boolean;
  isUnavailable: boolean;
}

/**
 * Admin module and feature flags (#5468). Starts from the server-rendered
 * value when the shell has one, otherwise reads `GET /public/platform-flags`.
 * An open tab re-reads the flags every minute, when it becomes visible again,
 * and at once after an operator saves one in Admin, so a switched-off module
 * disappears without a reload.
 *
 * Before a successful answer the state stays unresolved and flags are off.
 * A failed read never presents deployment defaults as confirmed Admin values;
 * a later failed refresh keeps the last confirmed flags. Visibility changes,
 * Admin updates and the refresh interval all retry without a reload.
 */
export function usePlatformFlags(
  initialFlags?: IPlatformFlags | null,
): PlatformFlagsState {
  const [state, setState] = useState<PlatformFlagsState>(() => ({
    flags: initialFlags ?? UNRESOLVED_FLAGS,
    isReady: Boolean(initialFlags),
    isUnavailable: false,
  }));

  useEffect(() => {
    let controller: AbortController | undefined;

    function refresh(): void {
      controller?.abort();
      setState((previous) =>
        previous.isUnavailable
          ? { ...previous, isUnavailable: false }
          : previous,
      );
      const current = new AbortController();
      controller = current;

      PublicService.getInstance()
        .getPlatformFlags(current.signal)
        .then((flags) => {
          if (!current.signal.aborted) {
            setState({ flags, isReady: true, isUnavailable: false });
          }
        })
        .catch((error: unknown) => {
          if (current.signal.aborted) {
            return;
          }
          logger.warn('Platform flags unavailable; keeping the last values', {
            error,
            reportToSentry: false,
          });
          // Keep readiness as well as values: only a successful read resolves
          // an initial outage. Confirmed server/client values remain usable.
          setState((previous) => ({
            ...previous,
            isUnavailable: !previous.isReady,
          }));
        });
    }

    function refreshWhenVisible(): void {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    }

    if (initialFlags) {
      setState({ flags: initialFlags, isReady: true, isUnavailable: false });
    } else {
      refresh();
    }
    const interval = window.setInterval(
      refreshWhenVisible,
      PLATFORM_FLAGS_REFRESH_INTERVAL_MS,
    );
    document.addEventListener('visibilitychange', refreshWhenVisible);
    const unsubscribe = subscribePlatformFlagsChanged(refresh);

    return () => {
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      unsubscribe();
    };
  }, [initialFlags]);

  return state;
}
