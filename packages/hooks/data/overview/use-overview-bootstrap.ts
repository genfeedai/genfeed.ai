'use client';

import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import type { IAgentRun, IAnalytics } from '@genfeedai/interfaces';
import type { PlatformTimeSeriesDataPoint } from '@genfeedai/props/analytics/charts.props';
import {
  AuthService,
  type OverviewBootstrapPayload,
} from '@genfeedai/services/auth/auth.service';
import type { AgentRunStats as CloudAgentRunStats } from '@genfeedai/types';
import { getPlaywrightAuthState } from '@helpers/auth/auth.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

export interface UseOverviewBootstrapOptions {
  initialActiveRuns?: IAgentRun[];
  initialAnalytics?: Partial<IAnalytics>;
  initialReviewInbox?: OverviewBootstrapPayload['reviewInbox'];
  initialRuns?: IAgentRun[];
  initialStats?: CloudAgentRunStats | null;
  initialTimeSeriesData?: PlatformTimeSeriesDataPoint[];
  revalidateOnMount?: boolean;
}

export interface UseOverviewBootstrapReturn {
  activeRuns: IAgentRun[];
  analytics: Partial<IAnalytics>;
  isLoading: boolean;
  refresh: () => Promise<void>;
  reviewInbox: OverviewBootstrapPayload['reviewInbox'];
  runs: IAgentRun[];
  stats: CloudAgentRunStats | null;
  timeSeriesData: PlatformTimeSeriesDataPoint[];
}

export function useOverviewBootstrap(
  options: UseOverviewBootstrapOptions = {},
): UseOverviewBootstrapReturn {
  const { isLoaded: isAuthLoaded, isSignedIn, orgId, userId } = useAuthIdentity();
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
      options.initialRuns == null &&
      options.initialStats === undefined &&
      options.initialActiveRuns == null &&
      options.initialTimeSeriesData == null
    ) {
      return undefined;
    }

    return {
      activeRuns: options.initialActiveRuns ?? [],
      analytics: options.initialAnalytics ?? {},
      reviewInbox: options.initialReviewInbox ?? {
        approvedCount: 0,
        changesRequestedCount: 0,
        pendingCount: 0,
        readyCount: 0,
        recentItems: [],
        rejectedCount: 0,
      },
      runs: options.initialRuns ?? [],
      stats: options.initialStats ?? null,
      timeSeries: options.initialTimeSeriesData ?? [],
    };
  }, [
    options.initialActiveRuns,
    options.initialAnalytics,
    options.initialReviewInbox,
    options.initialRuns,
    options.initialStats,
    options.initialTimeSeriesData,
  ]);

  const shouldFetch =
    effectiveIsAuthLoaded && effectiveIsSignedIn && !!effectiveUserId;

  const skipInitialFetch =
    (options.revalidateOnMount ?? initialData === undefined) === false &&
    !!initialData;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['overview-bootstrap', effectiveUserId, orgId ?? 'no-org'],
    queryFn: async () => {
      const service = await getAuthService();
      return await service.getOverviewBootstrap();
    },
    enabled: shouldFetch,
    initialData,
    staleTime: skipInitialFetch ? Number.POSITIVE_INFINITY : 0,
  });

  return useMemo(
    () => ({
      activeRuns: data?.activeRuns ?? [],
      analytics: data?.analytics ?? {},
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
      runs: data?.runs ?? [],
      stats: data?.stats ?? null,
      timeSeriesData: (data?.timeSeries ?? []) as PlatformTimeSeriesDataPoint[],
    }),
    [
      data?.activeRuns,
      data?.analytics,
      data?.reviewInbox,
      data?.runs,
      data?.stats,
      data?.timeSeries,
      isLoading,
      refetch,
    ],
  );
}
