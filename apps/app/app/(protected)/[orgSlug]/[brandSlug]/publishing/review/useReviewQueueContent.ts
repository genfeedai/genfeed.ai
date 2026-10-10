import { TurboRunStatus } from '@genfeedai/contracts';
import type { ITurboRunSummary } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { TurboRunsService } from '@services/batch/batches.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { captureWorkspaceShellApproval } from '@/lib/workspace-shell/workspace-shell-telemetry';
import {
  areReviewFiltersEqual,
  getNextActiveItemId,
  getReviewFilterCounts,
  getVisibleReviewItems,
  parseReviewFilters,
  type ReviewStatusFilter,
  serializeReviewFilters,
} from './components/review-grid.helpers';
import { isReadyToReview } from './components/review-state';
import { useTurboRewriteJob } from './useTurboRewriteJob';

const DEFAULT_STATUS_FILTERS: ReviewStatusFilter[] = ['ready'];

function buildReviewQuery(input: {
  turboRunId: string | null;
  filters: readonly ReviewStatusFilter[];
  itemId: string | null;
  baseParams: URLSearchParams;
}): string {
  const params = new URLSearchParams(input.baseParams.toString());

  if (input.turboRunId) {
    params.set('turboRun', input.turboRunId);
  } else {
    params.delete('turboRun');
  }

  params.set('filter', serializeReviewFilters(input.filters));

  if (input.itemId) {
    params.set('item', input.itemId);
  } else {
    params.delete('item');
  }

  return params.toString();
}

export function useReviewQueueContent() {
  const { openConfirm } = useConfirmModal();
  const notifications = useMemo(() => NotificationsService.getInstance(), []);
  const queryClient = useQueryClient();
  const getTurboRunsService = useAuthedService((token: string) =>
    TurboRunsService.getInstance(token),
  );
  const pathname = usePathname();
  const { replace } = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const requestedTurboRunId = searchParams.get('turboRun');
  const filterParam = searchParams.get('filter');
  const requestedFilters = parseReviewFilters(filterParam);
  const requestedItemId = searchParams.get('item');

  const [selectedTurboRunId, setSelectedTurboRunId] = useState<string | null>(
    requestedTurboRunId,
  );
  const [activeFilters, setActiveFilters] = useState<ReviewStatusFilter[]>(
    () => requestedFilters ?? DEFAULT_STATUS_FILTERS,
  );
  const [activeItemId, setActiveItemId] = useState<string | null>(
    requestedItemId,
  );
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isActioning, setIsActioning] = useState(false);

  // Last query we wrote — ignore echo updates from our own replace().
  const lastWrittenQueryRef = useRef<string | null>(null);
  const hasExplainedAutoBroadenRef = useRef(false);

  const {
    data: turboRuns = [],
    error: turboRunsError,
    isFetching: isTurboRunsFetching,
    isLoading: isTurboRunsLoading,
    refetch: refetchTurboRuns,
  } = useQuery({
    queryKey: ['review-batches'],
    queryFn: async () => {
      const service = await getTurboRunsService();
      return service.getTurboRuns();
    },
  });

  const turboRunList = useMemo(
    () => (Array.isArray(turboRuns) ? turboRuns : []),
    [turboRuns],
  );
  const hasInvalidTurboRunPayload = !Array.isArray(turboRuns);
  const activeTurboRunId =
    selectedTurboRunId ?? requestedTurboRunId ?? turboRunList[0]?.id ?? null;

  const syncReviewLocation = useCallback(
    (input: {
      turboRunId?: string | null;
      filters?: readonly ReviewStatusFilter[];
      itemId?: string | null;
    }) => {
      const nextTurboRunId =
        input.turboRunId === undefined ? activeTurboRunId : input.turboRunId;
      const nextFilters =
        input.filters === undefined ? activeFilters : input.filters;
      const nextItemId =
        input.itemId === undefined ? activeItemId : input.itemId;

      const nextQuery = buildReviewQuery({
        baseParams: new URLSearchParams(searchParamsString),
        turboRunId: nextTurboRunId,
        filters: nextFilters,
        itemId: nextItemId,
      });

      // Critical: no-op when nothing changed — replace() on an identical URL
      // still churns searchParams in App Router and retriggers effects.
      if (nextQuery === searchParamsString) {
        lastWrittenQueryRef.current = nextQuery;
        return;
      }

      lastWrittenQueryRef.current = nextQuery;
      const nextHref = nextQuery ? `${pathname}?${nextQuery}` : pathname;
      replace(nextHref, { scroll: false });
    },
    [
      activeTurboRunId,
      activeFilters,
      activeItemId,
      pathname,
      replace,
      searchParamsString,
    ],
  );

  const {
    data: activeTurboRun = null,
    error: activeTurboRunError,
    isFetching: isTurboRunFetching,
    isLoading: isTurboRunLoading,
    refetch: refetchTurboRun,
  } = useQuery({
    queryKey: ['review-batch', activeTurboRunId],
    queryFn: async () => {
      if (!activeTurboRunId) {
        return null;
      }
      const service = await getTurboRunsService();
      return service.getTurboRun(activeTurboRunId);
    },
    enabled: !!activeTurboRunId,
  });

  const refreshTurboRun = useCallback(async () => {
    await refetchTurboRun();
  }, [refetchTurboRun]);

  const { isRewriteStarting, rewriteProgress, rewritingIds, startRewrite } =
    useTurboRewriteJob({
      turboRunId: activeTurboRunId,
      onItemsRewritten: refreshTurboRun,
    });

  const refreshQueue = useCallback(async () => {
    await Promise.all([refetchTurboRuns(), refetchTurboRun()]);
  }, [refetchTurboRun, refetchTurboRuns]);

  const actionableItems = useMemo(
    () => activeTurboRun?.items.filter((item) => isReadyToReview(item)) ?? [],
    [activeTurboRun],
  );

  const filterCounts = useMemo(
    () => getReviewFilterCounts(activeTurboRun?.items ?? []),
    [activeTurboRun?.items],
  );

  const visibleItems = useMemo(
    () => getVisibleReviewItems(activeTurboRun?.items ?? [], activeFilters),
    [activeTurboRun?.items, activeFilters],
  );

  const canDiscardTurboRun =
    activeTurboRun !== null && activeTurboRun.status !== TurboRunStatus.CANCELLED;

  const activeItem = useMemo(
    () => visibleItems.find((item) => item.id === activeItemId) ?? null,
    [activeItemId, visibleItems],
  );

  useEffect(() => {
    if (selectedTurboRunId || !requestedTurboRunId) {
      return;
    }

    if (turboRunList.some((turboRun) => turboRun.id === requestedTurboRunId)) {
      setSelectedTurboRunId(requestedTurboRunId);
    }
  }, [turboRunList, requestedTurboRunId, selectedTurboRunId]);

  // External URL changes only (back/forward / pasted link). Skip our own writes.
  useEffect(() => {
    if (searchParamsString === lastWrittenQueryRef.current) {
      return;
    }

    const parsedFilters = parseReviewFilters(filterParam);
    if (parsedFilters !== null) {
      setActiveFilters((current) =>
        areReviewFiltersEqual(current, parsedFilters) ? current : parsedFilters,
      );
    }

    if (requestedTurboRunId) {
      setSelectedTurboRunId((current) =>
        current === requestedTurboRunId ? current : requestedTurboRunId,
      );
    }

    setActiveItemId((current) => {
      if (requestedItemId) {
        return current === requestedItemId ? current : requestedItemId;
      }
      // URL dropped item — keep local selection until visible-items guard runs.
      return current;
    });
  }, [filterParam, requestedTurboRunId, requestedItemId, searchParamsString]);

  // Ensure the active row is always inside the current filter window (local only).
  // URL writes happen once below when local + URL actually disagree.
  useEffect(() => {
    if (visibleItems.length === 0) {
      setActiveItemId((current) => (current === null ? current : null));
      return;
    }

    setActiveItemId((current) => {
      if (current && visibleItems.some((item) => item.id === current)) {
        return current;
      }
      // Prefer deep-linked item when still visible after a filter change.
      if (
        requestedItemId &&
        visibleItems.some((item) => item.id === requestedItemId)
      ) {
        return requestedItemId;
      }
      return visibleItems[0]?.id ?? null;
    });
  }, [requestedItemId, visibleItems]);

  // Single URL write path for settled local state — only when query would change.
  useEffect(() => {
    if (!activeTurboRunId) {
      return;
    }

    // Wait until batch list is known so we don't thrash empty filters.
    if (activeTurboRun === null && isTurboRunLoading) {
      return;
    }

    syncReviewLocation({
      turboRunId: activeTurboRunId,
      filters: activeFilters,
      itemId: activeItemId,
    });
  }, [
    activeTurboRun,
    activeTurboRunId,
    activeFilters,
    activeItemId,
    isTurboRunLoading,
    syncReviewLocation,
  ]);

  // Default ready-only view is empty but the batch has other work — open all.
  useEffect(() => {
    const shouldAutoBroaden =
      activeTurboRun &&
      activeTurboRun.status !== TurboRunStatus.CANCELLED &&
      activeFilters.length === 1 &&
      activeFilters[0] === 'ready' &&
      filterCounts.ready === 0 &&
      filterCounts.all > 0;

    if (!shouldAutoBroaden) {
      hasExplainedAutoBroadenRef.current = false;
      return;
    }

    if (!hasExplainedAutoBroadenRef.current) {
      hasExplainedAutoBroadenRef.current = true;
      notifications.info('No items are ready, so all statuses are shown.');
    }

    setActiveFilters([]);
  }, [activeTurboRun, activeFilters, filterCounts, notifications]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set(
        Array.from(prev).filter((itemId) =>
          actionableItems.some((item) => item.id === itemId),
        ),
      );

      return next.size === prev.size ? prev : next;
    });
  }, [actionableItems]);

  const handleToggleSelect = useCallback((itemId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);

      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }

      return next;
    });
  }, []);

  const handleSelectItem = useCallback((itemId: string) => {
    setActiveItemId(itemId);
  }, []);

  const handleFilterChange = useCallback(
    (filters: ReviewStatusFilter[]) => {
      const nextVisibleItems = getVisibleReviewItems(
        activeTurboRun?.items ?? [],
        filters,
      );
      const nextItemId = getNextActiveItemId(nextVisibleItems, activeItemId);

      setActiveFilters(filters);
      setActiveItemId(nextItemId);
    },
    [activeTurboRun?.items, activeItemId],
  );

  const handleBulkAction = useCallback(
    async (action: 'approve' | 'reject') => {
      if (selectedIds.size === 0 || !activeTurboRunId) {
        return;
      }

      const selectedItemIds = Array.from(selectedIds);
      const remainingItems = visibleItems.filter(
        (item) => !selectedIds.has(item.id),
      );

      setIsActioning(true);
      try {
        const service = await getTurboRunsService();
        await service.itemAction(activeTurboRunId, {
          action,
          itemIds: selectedItemIds,
        });

        setSelectedIds(new Set());
        await refreshTurboRun();
        const nextItemId = getNextActiveItemId(remainingItems, activeItemId);
        setActiveItemId(nextItemId);
        captureWorkspaceShellApproval({
          action,
          integrity: 'not_applicable',
          outcome: 'success',
        });
      } catch (error) {
        captureWorkspaceShellApproval({
          action,
          integrity: 'not_applicable',
          outcome: 'failure',
        });
        logger.error(`Bulk ${action} failed`, error);
      } finally {
        setIsActioning(false);
      }
    },
    [
      activeTurboRunId,
      activeItemId,
      getTurboRunsService,
      refreshTurboRun,
      selectedIds,
      visibleItems,
    ],
  );

  // The rewrite runs in the background: the page stays usable while it does.
  const handleBulkRewrite = useCallback(async () => {
    if (selectedIds.size === 0 || isActioning) return;
    if (await startRewrite([...selectedIds])) {
      setSelectedIds(new Set());
    }
  }, [isActioning, selectedIds, startRewrite]);

  const updateTurboRunCaches = useCallback(
    (turboRun: ITurboRunSummary) => {
      queryClient.setQueryData(['review-batch', turboRun.id], turboRun);
      queryClient.setQueryData<ITurboRunSummary[]>(
        ['review-batches'],
        (currentTurboRuns) =>
          currentTurboRuns?.map((currentTurboRun) =>
            currentTurboRun.id === turboRun.id ? turboRun : currentTurboRun,
          ) ?? [turboRun],
      );
    },
    [queryClient],
  );

  const executeDiscardTurboRun = useCallback(
    async (turboRunId: string, reviewableItemIds: string[]) => {
      setIsActioning(true);
      let rejectedTurboRun: ITurboRunSummary | null = null;

      try {
        const service = await getTurboRunsService();

        if (reviewableItemIds.length > 0) {
          rejectedTurboRun = await service.itemAction(turboRunId, {
            action: 'reject',
            feedback: 'Review batch discarded.',
            itemIds: reviewableItemIds,
          });
        }

        const cancelledTurboRun = await service.cancelTurboRun(turboRunId);
        updateTurboRunCaches(cancelledTurboRun);
        setSelectedIds(new Set());
        setActiveItemId(null);
        setActiveFilters(DEFAULT_STATUS_FILTERS);
        notifications.success('Review batch discarded');
      } catch (error) {
        if (rejectedTurboRun) {
          updateTurboRunCaches(rejectedTurboRun);
          setSelectedIds(new Set());
          notifications.warning(
            'Ready drafts were discarded, but unfinished items could not be cancelled. Retry Discard batch to finish.',
          );
          logger.error(
            'Discard batch cancellation failed after review items were rejected',
            error,
          );
        } else {
          notifications.error('Failed to discard review batch');
          logger.error('Discard batch failed before cancellation', error);
        }
      } finally {
        try {
          await refreshQueue();
        } catch (refreshError) {
          logger.error(
            'Refresh review queue after discard failed',
            refreshError,
          );
        }
        setIsActioning(false);
      }
    },
    [getTurboRunsService, notifications, refreshQueue, updateTurboRunCaches],
  );

  const handleDiscardTurboRun = useCallback(() => {
    if (!activeTurboRun || !canDiscardTurboRun || isActioning) {
      return;
    }

    const reviewableItemIds = activeTurboRun.items
      .filter((item) => isReadyToReview(item))
      .map((item) => item.id);

    openConfirm({
      confirmLabel: 'Discard batch',
      isError: true,
      label: 'Discard review batch',
      message:
        'Ready drafts will be rejected and unfinished items will be cancelled. Prior review decisions stay unchanged. This action cannot be undone.',
      onConfirm: () => executeDiscardTurboRun(activeTurboRun.id, reviewableItemIds),
    });
  }, [
    activeTurboRun,
    canDiscardTurboRun,
    executeDiscardTurboRun,
    isActioning,
    openConfirm,
  ]);

  const handleApproveItem = useCallback(
    async (itemId: string) => {
      if (!activeTurboRunId) {
        return;
      }

      const approvedItem =
        activeTurboRun?.items.find((item) => item.id === itemId) ?? null;
      const remainingItems = visibleItems.filter((item) => item.id !== itemId);

      setIsActioning(true);
      try {
        const service = await getTurboRunsService();
        await service.itemAction(activeTurboRunId, {
          action: 'approve',
          itemIds: [itemId],
        });

        await refreshTurboRun();
        captureWorkspaceShellApproval({
          action: 'approve',
          integrity: 'not_applicable',
          outcome: 'success',
        });

        setSelectedIds((prev) => {
          if (!prev.has(itemId)) {
            return prev;
          }

          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });

        if (approvedItem?.postId && !approvedItem.scheduledDate) {
          setSelectedPostId(approvedItem.postId);
        }

        const nextItemId = getNextActiveItemId(remainingItems, itemId);
        setActiveItemId(nextItemId);
      } catch (error) {
        captureWorkspaceShellApproval({
          action: 'approve',
          integrity: 'not_applicable',
          outcome: 'failure',
        });
        logger.error('Approve item failed', error);
      } finally {
        setIsActioning(false);
      }
    },
    [activeTurboRun, activeTurboRunId, getTurboRunsService, refreshTurboRun, visibleItems],
  );

  const handleRequestChanges = useCallback(
    async (itemId: string, feedback?: string) => {
      if (!activeTurboRunId) {
        return;
      }

      const remainingItems = visibleItems.filter((item) => item.id !== itemId);

      setIsActioning(true);
      try {
        const service = await getTurboRunsService();
        await service.itemAction(activeTurboRunId, {
          action: 'request_changes',
          feedback,
          itemIds: [itemId],
        });

        await refreshTurboRun();
        setSelectedIds((prev) => {
          if (!prev.has(itemId)) {
            return prev;
          }

          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
        const nextItemId = getNextActiveItemId(remainingItems, itemId);
        setActiveItemId(nextItemId);
      } catch (error) {
        logger.error('Request changes failed', error);
      } finally {
        setIsActioning(false);
      }
    },
    [activeTurboRunId, getTurboRunsService, refreshTurboRun, visibleItems],
  );

  const handleAssignItem = useCallback(
    async (itemId: string, assigneeId: string) => {
      if (!activeTurboRunId) {
        return;
      }

      setIsActioning(true);
      try {
        const service = await getTurboRunsService();
        const turboRun = await service.assignItem(
          activeTurboRunId,
          itemId,
          assigneeId,
        );
        updateTurboRunCaches(turboRun);
      } catch (error) {
        logger.error('Assign review item failed', error);
      } finally {
        setIsActioning(false);
      }
    },
    [activeTurboRunId, getTurboRunsService, updateTurboRunCaches],
  );

  const handleUnassignItem = useCallback(
    async (itemId: string) => {
      if (!activeTurboRunId) {
        return;
      }

      setIsActioning(true);
      try {
        const service = await getTurboRunsService();
        const turboRun = await service.unassignItem(activeTurboRunId, itemId);
        updateTurboRunCaches(turboRun);
      } catch (error) {
        logger.error('Unassign review item failed', error);
      } finally {
        setIsActioning(false);
      }
    },
    [activeTurboRunId, getTurboRunsService, updateTurboRunCaches],
  );

  const handleRejectItem = useCallback(
    async (itemId: string, feedback?: string) => {
      if (!activeTurboRunId) {
        return;
      }

      const remainingItems = visibleItems.filter((item) => item.id !== itemId);

      setIsActioning(true);
      try {
        const service = await getTurboRunsService();
        await service.itemAction(activeTurboRunId, {
          action: 'reject',
          feedback,
          itemIds: [itemId],
        });

        await refreshTurboRun();
        captureWorkspaceShellApproval({
          action: 'reject',
          integrity: 'not_applicable',
          outcome: 'success',
        });

        setSelectedIds((prev) => {
          if (!prev.has(itemId)) {
            return prev;
          }

          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });

        const nextItemId = getNextActiveItemId(remainingItems, itemId);
        setActiveItemId(nextItemId);
      } catch (error) {
        captureWorkspaceShellApproval({
          action: 'reject',
          integrity: 'not_applicable',
          outcome: 'failure',
        });
        logger.error('Reject item failed', error);
      } finally {
        setIsActioning(false);
      }
    },
    [activeTurboRunId, getTurboRunsService, refreshTurboRun, visibleItems],
  );

  const handleTurboRunChange = useCallback((value: string) => {
    setSelectedTurboRunId(value);
    setActiveItemId(null);
    setSelectedIds(new Set());
    setActiveFilters(DEFAULT_STATUS_FILTERS);
  }, []);

  return {
    activeFilters,
    activeItem,
    activeTurboRun,
    activeTurboRunError,
    activeTurboRunId,
    turboRunList,
    turboRunsError,
    canDiscardTurboRun,
    filterCounts,
    hasInvalidTurboRunPayload,
    isActioning,
    isTurboRunsLoading,
    isTurboRunLoading,
    isRefreshing: isTurboRunsFetching || isTurboRunFetching,
    refreshQueue,
    selectedIds,
    selectedPostId,
    visibleItems,
    handleApproveItem,
    handleAssignItem,
    handleTurboRunChange,
    handleBulkAction,
    handleBulkRewrite,
    isRewriteStarting,
    rewriteProgress,
    rewritingIds,
    handleDiscardTurboRun,
    handleFilterChange,
    handleRequestChanges,
    handleRejectItem,
    handleSelectItem,
    handleToggleSelect,
    handleUnassignItem,
    setSelectedPostId,
  };
}
