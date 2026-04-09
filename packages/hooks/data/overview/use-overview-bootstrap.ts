'use client';

import { useAuth } from '@clerk/nextjs';
import type { IAgentRun, IAnalytics } from '@genfeedai/interfaces';
import type { PlatformTimeSeriesDataPoint } from '@genfeedai/props/analytics/charts.props';
import {
  AuthService,
  type OverviewBootstrapPayload,
} from '@genfeedai/services/auth/auth.service';
import type { AgentRunStats as CloudAgentRunStats } from '@genfeedai/types';
import { getPlaywrightAuthState } from '@helpers/auth/clerk.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
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
  const { isLoaded: isAuthLoaded, isSignedIn, userId } = useAuth();
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

  const { data, isLoading, refresh } = useResource(
    async (_signal: AbortSignal) => {
      const service = await getAuthService();
      return await service.getOverviewBootstrap();
    },
    {
      enabled: shouldFetch,
      initialData,
      revalidateOnMount: options.revalidateOnMount ?? initialData === undefined,
    },
  );

  return useMemo(
    () => ({
      activeRuns: data?.activeRuns ?? [],
      analytics: data?.analytics ?? {},
      isLoading,
      refresh,
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
      refresh,
    ],
  );
}
