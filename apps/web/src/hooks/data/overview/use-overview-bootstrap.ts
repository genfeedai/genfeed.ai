'use client';

import type { IAnalytics } from '@genfeedai/contracts/interfaces';
import {
  AuthService,
  type OverviewBootstrapPayload,
} from '@genfeedai/services/auth/auth.service';
import { getPlaywrightAuthState } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { persistQueryMeta } from '@/lib/query-cache/persisted-query-cache';
import type { PlatformTimeSeriesDataPoint } from '@/props/analytics/charts.props';

const OVERVIEW_BOOTSTRAP_STALE_TIME_MS = 30_000;

export interface UseOverviewBootstrapOptions {
  /** Brand the page is scoped to; omit on org-level pages. */
  brandId?: string;
  initialAnalytics?: Partial<IAnalytics>;
  initialReviewInbox?: OverviewBootstrapPayload['reviewInbox'];
  initialTimeSeriesData?: PlatformTimeSeriesDataPoint[];
  revalidateOnMount?: boolean;
}

export interface UseOverviewBootstrapReturn {
  analytics: Partial<IAnalytics>;
  error: Error | null;
  isError: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
  reviewInbox: OverviewBootstrapPayload['reviewInbox'];
  timeSeriesData: PlatformTimeSeriesDataPoint[];
}

export function useOverviewBootstrap(
  options: UseOverviewBootstrapOptions = {},
): UseOverviewBootstrapReturn {
  const {
    isLoaded: isAuthLoaded,
    isSignedIn,
    orgId,
    userId,
  } = useAuthIdentity();
  const playwrightAuth = getPlaywrightAuthState();
  const effectiveIsAuthLoaded =
    isAuthLoaded || playwrightAuth?.isLoaded === true;
  const effectiveIsSignedIn = isSignedIn || playwrightAuth?.isSignedIn === true;
  const effectiveUserId = userId ?? playwrightAuth?.userId ?? null;

  const getAuthService = useAuthedService((token: string) =>
    AuthService.getInstance(token),
  );

  const initialData = useMemo<OverviewBootstrapPayload | undefined>(() => {
    if (
      options.initialAnalytics == null &&
      options.initialReviewInbox == null &&
      options.initialTimeSeriesData == null
    ) {
      return undefined;
    }

    return {
      analytics: options.initialAnalytics ?? {},
      reviewInbox: options.initialReviewInbox ?? {
        approvedCount: 0,
        changesRequestedCount: 0,
        pendingCount: 0,
        readyCount: 0,
        recentItems: [],
        rejectedCount: 0,
      },
      timeSeries: options.initialTimeSeriesData ?? [],
    };
  }, [
    options.initialAnalytics,
    options.initialReviewInbox,
    options.initialTimeSeriesData,
  ]);

  const shouldFetch =
    effectiveIsAuthLoaded && effectiveIsSignedIn && !!effectiveUserId;

  const skipInitialFetch =
    (options.revalidateOnMount ?? initialData === undefined) === false &&
    !!initialData;

  const { data, error, isError, isLoading, refetch } = useQuery({
    queryKey: [
      'overview-bootstrap',
      effectiveUserId,
      orgId ?? 'no-org',
      options.brandId ?? null,
    ],
    queryFn: async () => {
      const service = await getAuthService();
      return await service.getOverviewBootstrap(options.brandId);
    },
    enabled: shouldFetch,
    initialData,
    // Kept on the device for the next reload; a review item's media link may be
    // signed and short-lived, so it is left out of the copy.
    meta: persistQueryMeta({ omitKeys: ['mediaUrl'] }),
    // The rail preview and the page read this under one key. A stale time of 0
    // made the second to mount refetch what the first had just read.
    staleTime: skipInitialFetch
      ? Number.POSITIVE_INFINITY
      : options.revalidateOnMount === true
        ? 0
        : OVERVIEW_BOOTSTRAP_STALE_TIME_MS,
  });

  return useMemo(
    () => ({
      analytics: data?.analytics ?? {},
      error,
      isError,
      isLoading,
      refresh: async () => {
        await refetch();
      },
      reviewInbox: data?.reviewInbox ?? {
        approvedCount: 0,
        changesRequestedCount: 0,
        pendingCount: 0,
        readyCount: 0,
        recentItems: [],
        rejectedCount: 0,
      },
      timeSeriesData: (data?.timeSeries ?? []) as PlatformTimeSeriesDataPoint[],
    }),
    [
      data?.analytics,
      data?.reviewInbox,
      data?.timeSeries,
      error,
      isError,
      isLoading,
      refetch,
    ],
  );
}
