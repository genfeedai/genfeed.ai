'use client';

import { DEFAULT_PLATFORM_FLAGS } from '@genfeedai/contracts/constants';
import type { IPlatformFlags } from '@genfeedai/contracts/interfaces';
import { logger } from '@services/core/logger.service';
import { PublicService } from '@services/external/public.service';
import { useEffect, useState } from 'react';
import {
  PLATFORM_FLAGS_REFRESH_INTERVAL_MS,
  subscribePlatformFlagsChanged,
} from './platform-flags-sync';

interface PlatformFlagsState {
  flags: IPlatformFlags;
  isReady: boolean;
}

/**
 * Admin module and feature flags (#5468). Starts from the server-rendered
 * value when the shell has one, otherwise reads `GET /public/platform-flags`.
 * An open tab re-reads the flags every minute, when it becomes visible again,
 * and at once after an operator saves one in Admin, so a switched-off module
 * disappears without a reload.
 *
 * Until the first answer — or when the API is unreachable (offline desktop) —
 * every flag is on, the same default a fresh deployment has; a later failed
 * read keeps the last flags this tab saw.
 */
export function usePlatformFlags(
  initialFlags?: IPlatformFlags | null,
): PlatformFlagsState {
  const [state, setState] = useState<PlatformFlagsState>(() => ({
    flags: initialFlags ?? DEFAULT_PLATFORM_FLAGS,
    isReady: Boolean(initialFlags),
  }));

  useEffect(() => {
    let controller: AbortController | undefined;

    function refresh(): void {
      controller?.abort();
      const current = new AbortController();
      controller = current;

      PublicService.getInstance()
        .getPlatformFlags(current.signal)
        .then((flags) => {
          if (!current.signal.aborted) {
            setState({ flags, isReady: true });
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
          setState((previous) => ({ flags: previous.flags, isReady: true }));
        });
    }

    function refreshWhenVisible(): void {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    }

    if (!initialFlags) {
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
