'use client';

import { BatchItemStatus, TargetExecutionState } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createPublishingPostsFilterRoute,
} from '@genfeedai/contracts/constants';
import type { OverviewCard } from '@genfeedai/contracts/interfaces/ui/overview-card.interface';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isBrandResourceReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { AsyncState } from '@props/shared';
import { BatchesService } from '@services/batch/batches.service';
import { ReleaseGroupsService } from '@services/content/release-groups.service';
import { CredentialsService } from '@services/organization/credentials.service';
import { useQuery } from '@tanstack/react-query';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import OverviewLayout from '@ui/overview/OverviewLayout';
import {
  Calendar,
  ClipboardCheck,
  LayoutDashboard,
  List,
  Send,
} from 'lucide-react';
import { useMemo } from 'react';

import { isReadyToReview } from '../review/components/review-state';
import { buildAccountHealthRows } from './account-health.util';
import { buildBlockedTargetGroups } from './blocked-targets.util';
import { buildCadenceGaps } from './cadence-gaps.util';
import AccountHealthSection from './components/AccountHealthSection';
import BlockedTargetsSection from './components/BlockedTargetsSection';
import CadenceGapsSection from './components/CadenceGapsSection';
import Next24hQueueSection from './components/Next24hQueueSection';
import { buildNext24hQueue } from './next-24h-queue.util';

const NOT_POSTED_POSTS_PATH = createPublishingPostsFilterRoute({
  publicationState: 'not-posted',
});
const POSTED_POSTS_PATH = createPublishingPostsFilterRoute({
  publicationState: 'posted',
});

const QUEUE_WINDOW_MS = 24 * 60 * 60 * 1000;

function asError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error('Publishing data unavailable');
}

function toAsyncState<T>({
  data,
  error,
  isError,
  isLoading,
}: {
  data: T;
  error: unknown;
  isError: boolean;
  isLoading: boolean;
}): AsyncState<T> {
  if (isError) return { error: asError(error), status: 'error' };
  if (isLoading) return { status: 'loading' };
  return { data, status: 'success' };
}

async function fetchPublicationTotal(
  getReleaseGroups: () => Promise<ReleaseGroupsService>,
  brandId: string,
  publicationState: 'posted' | 'not-posted',
): Promise<number> {
  const service = await getReleaseGroups();
  const page = await service.findAllPage({
    brandId,
    limit: 1,
    page: 1,
    publicationState,
  });
  return page.total;
}

export default function PublishingOverviewPage() {
  const { href } = useOrgUrl();
  const collectionScope = useCollectionScope();
  const { brandId } = collectionScope;
  const isBrandReady = isBrandResourceReady(collectionScope);
  const getBatchesService = useAuthedService((token: string) =>
    BatchesService.getInstance(token),
  );
  const getReleaseGroupsService = useAuthedService((token: string) =>
    ReleaseGroupsService.getInstance(token),
  );
  const getCredentialsService = useAuthedService((token: string) =>
    CredentialsService.getInstance(token),
  );

  const batchesQuery = useQuery({
    queryKey: ['publish-overview-batches'],
    queryFn: async () => {
      const service = await getBatchesService();
      return service.getBatches();
    },
  });

  const notPostedTotalQuery = useQuery({
    enabled: isBrandReady,
    queryKey: ['publish-overview-not-posted-total', brandId],
    queryFn: () =>
      fetchPublicationTotal(
        getReleaseGroupsService,
        brandId as string,
        'not-posted',
      ),
  });

  const publishedTotalQuery = useQuery({
    enabled: isBrandReady,
    queryKey: ['publish-overview-published-total', brandId],
    queryFn: () =>
      fetchPublicationTotal(
        getReleaseGroupsService,
        brandId as string,
        'posted',
      ),
  });

  const now = useMemo(() => new Date(), []);

  const upcomingReleasesQuery = useQuery({
    enabled: isBrandReady,
    queryKey: ['publish-overview-upcoming', brandId, now.toISOString()],
    queryFn: async ({ signal }) => {
      const service = await getReleaseGroupsService();
      return service.findAll(
        {
          brandId: brandId as string,
          endDate: new Date(now.getTime() + QUEUE_WINDOW_MS).toISOString(),
          executionState: [TargetExecutionState.SCHEDULED],
          sort: 'scheduledDate: 1',
          startDate: now.toISOString(),
        },
        signal,
      );
    },
  });

  const failedReleasesQuery = useQuery({
    enabled: isBrandReady,
    queryKey: ['publish-overview-failed', brandId],
    queryFn: async ({ signal }) => {
      const service = await getReleaseGroupsService();
      return service.findAll(
        {
          brandId: brandId as string,
          executionState: [TargetExecutionState.FAILED],
        },
        signal,
      );
    },
  });

  const postedReleasesQuery = useQuery({
    enabled: isBrandReady,
    queryKey: ['publish-overview-posted-recent', brandId],
    queryFn: async ({ signal }) => {
      const service = await getReleaseGroupsService();
      return service.findAll(
        {
          brandId: brandId as string,
          limit: 100,
          publicationState: 'posted',
          sort: 'updatedAt: -1',
        },
        signal,
      );
    },
  });

  const accountHealthQuery = useQuery({
    enabled: isBrandReady,
    queryKey: ['publish-overview-account-health', brandId],
    queryFn: async () => {
      const service = await getCredentialsService();
      return service.listBrandAccountHealth(brandId as string);
    },
  });

  const batches = batchesQuery.data ?? [];
  const notPostedTotal = notPostedTotalQuery.data ?? 0;
  const publishedTotal = publishedTotalQuery.data ?? 0;
  const upcomingReleases = upcomingReleasesQuery.data ?? [];
  const failedReleases = failedReleasesQuery.data ?? [];
  const postedReleases = postedReleasesQuery.data ?? [];
  const accountHealth = accountHealthQuery.data ?? [];

  const next24hQueue = useMemo(
    () => buildNext24hQueue(upcomingReleases, now),
    [upcomingReleases, now],
  );
  const blockedTargetGroups = useMemo(
    () => buildBlockedTargetGroups(failedReleases),
    [failedReleases],
  );
  const cadenceGaps = useMemo(
    () =>
      buildCadenceGaps(
        { accountHealth, postedReleases, upcomingReleases },
        now,
      ),
    [accountHealth, postedReleases, upcomingReleases, now],
  );
  const accountHealthRows = useMemo(
    () => buildAccountHealthRows(accountHealth),
    [accountHealth],
  );

  const queueState = toAsyncState({
    data: next24hQueue,
    error: upcomingReleasesQuery.error,
    isError: upcomingReleasesQuery.isError,
    isLoading: upcomingReleasesQuery.isLoading,
  });
  const blockedState = toAsyncState({
    data: blockedTargetGroups,
    error: failedReleasesQuery.error,
    isError: failedReleasesQuery.isError,
    isLoading: failedReleasesQuery.isLoading,
  });
  const accountHealthState = toAsyncState({
    data: accountHealthRows,
    error: accountHealthQuery.error,
    isError: accountHealthQuery.isError,
    isLoading: accountHealthQuery.isLoading,
  });

  const cadenceError =
    accountHealthQuery.error ??
    postedReleasesQuery.error ??
    upcomingReleasesQuery.error;
  const isCadenceError =
    accountHealthQuery.isError ||
    postedReleasesQuery.isError ||
    upcomingReleasesQuery.isError;
  const isCadenceLoading =
    accountHealthQuery.isLoading ||
    postedReleasesQuery.isLoading ||
    upcomingReleasesQuery.isLoading;
  const cadenceState = toAsyncState({
    data: cadenceGaps,
    error: cadenceError,
    isError: isCadenceError,
    isLoading: isCadenceLoading,
  });

  const retryQueue = () => void upcomingReleasesQuery.refetch();
  const retryBlocked = () => void failedReleasesQuery.refetch();
  const retryAccountHealth = () => void accountHealthQuery.refetch();
  const retryCadence = () => {
    void Promise.all([
      accountHealthQuery.refetch(),
      postedReleasesQuery.refetch(),
      upcomingReleasesQuery.refetch(),
    ]);
  };

  const reviewPulse = useMemo(() => {
    const batchList = Array.isArray(batches) ? batches : [];
    let ready = 0;
    let failed = 0;
    let pending = 0;

    for (const batch of batchList) {
      for (const item of batch.items ?? []) {
        if (isReadyToReview(item)) {
          ready += 1;
        } else if (item.status === BatchItemStatus.FAILED) {
          failed += 1;
        } else if (
          item.status === BatchItemStatus.PENDING ||
          item.status === BatchItemStatus.PROCESSING
        ) {
          pending += 1;
        }
      }
    }

    return {
      activeBatches: batchList.length,
      failed,
      pending,
      ready,
    };
  }, [batches]);

  const isMetricsLoading =
    batchesQuery.isLoading ||
    notPostedTotalQuery.isLoading ||
    publishedTotalQuery.isLoading;
  const isMetricsError =
    batchesQuery.isError ||
    notPostedTotalQuery.isError ||
    publishedTotalQuery.isError;

  const kpiItems = [
    {
      description: 'Items waiting for human approval',
      isLoading: isMetricsLoading,
      label: 'Ready to review',
      value: reviewPulse.ready,
    },
    {
      description: 'Drafts and scheduled, not live yet',
      isLoading: isMetricsLoading,
      label: 'Not posted',
      value: notPostedTotal,
    },
    {
      description: 'Live on destinations',
      isLoading: isMetricsLoading,
      label: 'Published',
      value: publishedTotal,
    },
    {
      description: 'Generation failures in open batches',
      isLoading: isMetricsLoading,
      label: 'Failed items',
      value: reviewPulse.failed,
      valueClassName: reviewPulse.failed > 0 ? 'text-destructive' : undefined,
    },
  ];

  const cards: OverviewCard[] = [
    {
      color: 'bg-emerald-500/12 text-emerald-300',
      cta: 'Open Review',
      description: batchesQuery.isError
        ? 'Review queue could not be loaded.'
        : batchesQuery.isLoading
          ? 'Loading review queue...'
          : reviewPulse.ready > 0
            ? `${reviewPulse.ready} item${reviewPulse.ready === 1 ? '' : 's'} ready to approve or reject.`
            : 'No queue pressure. Open Review when the next batch lands.',
      href: href(APP_ROUTES.PUBLISHING.REVIEW),
      icon: ClipboardCheck,
      id: 'review',
      label: 'Review queue',
    },
    {
      color: 'bg-amber-500/12 text-amber-300',
      cta: 'Browse drafts',
      description: notPostedTotalQuery.isError
        ? 'Not-posted posts could not be loaded.'
        : notPostedTotalQuery.isLoading
          ? 'Loading not-posted posts...'
          : notPostedTotal > 0
            ? `${notPostedTotal} draft or scheduled post${notPostedTotal === 1 ? '' : 's'} in the pipeline.`
            : 'No drafts waiting. Create a release when you are ready.',
      href: href(NOT_POSTED_POSTS_PATH),
      icon: List,
      id: 'drafts',
      label: 'Not posted',
    },
    {
      color: 'bg-sky-500/12 text-sky-300',
      cta: 'Open calendar',
      description: 'See what ships this week and drag to reschedule.',
      href: href(APP_ROUTES.PUBLISHING.CALENDAR),
      icon: Calendar,
      id: 'calendar',
      label: 'Calendar',
    },
    {
      color: 'bg-violet-500/12 text-violet-300',
      cta: 'View published',
      description: publishedTotalQuery.isError
        ? 'Published posts could not be loaded.'
        : publishedTotalQuery.isLoading
          ? 'Loading published posts...'
          : publishedTotal > 0
            ? `${publishedTotal} live post${publishedTotal === 1 ? '' : 's'} across destinations.`
            : 'Nothing live yet. Approved work will land here after publish.',
      href: href(POSTED_POSTS_PATH),
      icon: Send,
      id: 'published',
      label: 'Published',
    },
  ];

  return (
    <OverviewLayout
      actionsTitle="Go to work"
      cards={cards}
      description="Review queue, drafts, calendar, and published posts."
      header={
        <div className="space-y-6">
          <KPISection
            error={
              isMetricsError ? 'Publishing metrics could not be loaded.' : null
            }
            gridCols={{ desktop: 4, mobile: 2, tablet: 2 }}
            isLoading={isMetricsLoading}
            items={kpiItems}
          />
          <Next24hQueueSection onRetry={retryQueue} state={queueState} />
          <BlockedTargetsSection onRetry={retryBlocked} state={blockedState} />
          <AccountHealthSection
            onRetry={retryAccountHealth}
            state={accountHealthState}
          />
          <CadenceGapsSection onRetry={retryCadence} state={cadenceState} />
        </div>
      }
      icon={LayoutDashboard}
      label="Publishing"
    />
  );
}
