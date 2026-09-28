'use client';

import { DEFAULT_PLATFORM_FLAGS } from '@genfeedai/contracts/constants';
import type { IPlatformFlags } from '@genfeedai/contracts/interfaces';
import { logger } from '@services/core/logger.service';
import { PublicService } from '@services/external/public.service';
import { useEffect, useState } from 'react';

interface PlatformFlagsState {
  flags: IPlatformFlags;
  isReady: boolean;
}

/**
 * Admin module and feature flags (#5468). Uses the server-rendered value when
 * the shell has one, otherwise reads `GET /public/platform-flags` once. Until
 * then — or when the API is unreachable (offline desktop) — every flag is on,
 * the same default a fresh deployment has.
 */
export function usePlatformFlags(
  initialFlags?: IPlatformFlags | null,
): PlatformFlagsState {
  const [state, setState] = useState<PlatformFlagsState>(() => ({
    flags: initialFlags ?? DEFAULT_PLATFORM_FLAGS,
    isReady: Boolean(initialFlags),
  }));

  useEffect(() => {
    if (initialFlags) {
      setState({ flags: initialFlags, isReady: true });
      return;
    }

    const controller = new AbortController();
    PublicService.getInstance()
      .getPlatformFlags(controller.signal)
      .then((flags) => {
        if (!controller.signal.aborted) {
          setState({ flags, isReady: true });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        logger.warn('Platform flags unavailable; keeping the defaults', {
          error,
          reportToSentry: false,
        });
        setState({ flags: DEFAULT_PLATFORM_FLAGS, isReady: true });
      });

    return () => controller.abort();
  }, [initialFlags]);

  return state;
}
