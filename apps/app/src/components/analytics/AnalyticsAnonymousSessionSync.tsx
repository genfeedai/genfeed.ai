'use client';

import { useAuthUser } from '@hooks/auth/use-auth-user';
import { useEffect } from 'react';
import {
  ensureAnalyticsAnonymous,
  isAnalyticsEnabled,
} from '@/lib/analytics';

function EnabledAnalyticsAnonymousSessionSync() {
  const { isLoaded, user } = useAuthUser();

  useEffect(() => {
    if (isLoaded && !user?.id) {
      ensureAnalyticsAnonymous();
    }
  }, [isLoaded, user?.id]);

  return null;
}

/** Remove persisted account scope once Better Auth confirms no active user. */
export default function AnalyticsAnonymousSessionSync() {
  return isAnalyticsEnabled() ? <EnabledAnalyticsAnonymousSessionSync /> : null;
}
