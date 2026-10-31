'use client';

import { useCallback, useEffect, useState } from 'react';
import type { UseConnectCardDismissalResult } from '@/features/home/props/connect-card-dismissal.props';

const DISMISS_KEY_PREFIX = 'genfeed:connect-card-dismissed:v1';
// The Connect page has no other in-app entry, so a dismissed card returns
// after a month instead of orphaning the route for good.
export const CONNECT_CARD_DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getDismissKey(organizationId: string): string {
  return `${DISMISS_KEY_PREFIX}:${organizationId}`;
}

function readIsDismissed(organizationId: string): boolean {
  try {
    const key = getDismissKey(organizationId);
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return false;
    }

    const dismissedAt = Number(raw);
    if (
      !Number.isFinite(dismissedAt) ||
      Date.now() - dismissedAt > CONNECT_CARD_DISMISS_TTL_MS
    ) {
      window.localStorage.removeItem(key);
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Remembers, per browser and organization, that the optional Connect card was
 * dismissed. `isDismissed` is `null` until storage has been read so the card
 * never flashes in for a viewer who already dismissed it.
 */
export function useConnectCardDismissal(
  organizationId: string,
): UseConnectCardDismissalResult {
  // Tagged with the organization it was read for, so switching organizations
  // reports `null` until storage has been read again instead of the old value.
  const [state, setState] = useState<{
    isDismissed: boolean;
    organizationId: string;
  } | null>(null);

  useEffect(() => {
    setState({
      isDismissed: readIsDismissed(organizationId),
      organizationId,
    });
  }, [organizationId]);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(
        getDismissKey(organizationId),
        String(Date.now()),
      );
    } catch {
      // Storage unavailable: hide for this view only.
    }
    setState({ isDismissed: true, organizationId });
  }, [organizationId]);

  const isDismissed =
    state?.organizationId === organizationId ? state.isDismissed : null;

  return { dismiss, isDismissed };
}
