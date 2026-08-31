import { BatchStatus } from '@genfeedai/enums';
import type { IBatchSummary } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { BatchesService } from '@services/batch/batches.service';
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

const DEFAULT_STATUS_FILTERS: ReviewStatusFilter[] = ['ready'];

function buildReviewQuery(input: {
  batchId: string | null;
  filters: readonly ReviewStatusFilter[];
  itemId: string | null;
  baseParams: URLSearchParams;
}): string {
  const params = new URLSearchParams(input.baseParams.toString());

  if (input.batchId) {
    params.set('batch', input.batchId);
  } else {
    params.delete('batch');
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
  const getBatchesService = useAuthedService((token: string) =>
    BatchesService.getInstance(token),
  );
  const pathname = usePathname();
  const { replace } = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const requestedBatchId = searchParams.get('batch');
  const filterParam = searchParams.get('filter');
  const requestedFilters = parseReviewFilters(filterParam);
  const requestedItemId = searchParams.get('item');

  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(
    requestedBatchId,
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
    data: batches = [],
    error: batchesError,
    isFetching: isBatchesFetching,
    isLoading: isBatchesLoading,
    refetch: refetchBatches,
  } = useQuery({
    queryKey: ['review-batches'],
    queryFn: async () => {
      const service = await getBatchesService();
      return service.getBatches();
    },
  });

  const batchList = useMemo(
    () => (Array.isArray(batches) ? batches : []),
    [batches],
  );
  const hasInvalidBatchPayload = !Array.isArray(batches);
  const activeBatchId =
    selectedBatchId ?? requestedBatchId ?? batchList[0]?.id ?? null;

  const syncReviewLocation = useCallback(
    (input: {
      batchId?: string | null;
      filters?: readonly ReviewStatusFilter[];
      itemId?: string | null;
    }) => {
      const nextBatchId =
        input.batchId === undefined ? activeBatchId : input.batchId;
      const nextFilters =
        input.filters === undefined ? activeFilters : input.filters;
      const nextItemId =
        input.itemId === undefined ? activeItemId : input.itemId;

      const nextQuery = buildReviewQuery({
        baseParams: new URLSearchParams(searchParamsString),
        batchId: nextBatchId,
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
      activeBatchId,
      activeFilters,
      activeItemId,
      pathname,
      replace,
      searchParamsString,
    ],
  );

  const {
    data: activeBatch = null,
    error: activeBatchError,
    isFetching: isBatchFetching,
    isLoading: isBatchLoading,
    refetch: refetchBatch,
  } = useQuery({
    queryKey: ['review-batch', activeBatchId],
    queryFn: async () => {
      if (!activeBatchId) {
        return null;
      }
      const service = await getBatchesService();
      return service.getBatch(activeBatchId);
    },
    enabled: !!activeBatchId,
  });

  const refreshBatch = useCallback(async () => {
    await refetchBatch();
  }, [refetchBatch]);

  const refreshQueue = useCallback(async () => {
    await Promise.all([refetchBatches(), refetchBatch()]);
  }, [refetchBatch, refetchBatches]);

  const actionableItems = useMemo(
    () => activeBatch?.items.filter((item) => isReadyToReview(item)) ?? [],
    [activeBatch],
  );

  const filterCounts = useMemo(
    () => getReviewFilterCounts(activeBatch?.items ?? []),
    [activeBatch?.items],
  );

  const visibleItems = useMemo(
    () => getVisibleReviewItems(activeBatch?.items ?? [], activeFilters),
    [activeBatch?.items, activeFilters],
  );

  const canDiscardBatch =
    activeBatch !== null && activeBatch.status !== BatchStatus.CANCELLED;

  const activeItem = useMemo(
    () => visibleItems.find((item) => item.id === activeItemId) ?? null,
    [activeItemId, visibleItems],
  );

  useEffect(() => {
    if (selectedBatchId || !requestedBatchId) {
      return;
    }

    if (batchList.some((batch) => batch.id === requestedBatchId)) {
      setSelectedBatchId(requestedBatchId);
    }
  }, [batchList, requestedBatchId, selectedBatchId]);

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

    if (requestedBatchId) {
      setSelectedBatchId((current) =>
        current === requestedBatchId ? current : requestedBatchId,
      );
    }

    setActiveItemId((current) => {
      if (requestedItemId) {
        return current === requestedItemId ? current : requestedItemId;
      }
      // URL dropped item — keep local selection until visible-items guard runs.
      return current;
    });
  }, [filterParam, requestedBatchId, requestedItemId, searchParamsString]);

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
    if (!activeBatchId) {
      return;
    }

    // Wait until batch list is known so we don't thrash empty filters.
    if (activeBatch === null && isBatchLoading) {
      return;
    }

    syncReviewLocation({
      batchId: activeBatchId,
      filters: activeFilters,
      itemId: activeItemId,
    });
  }, [
    activeBatch,
    activeBatchId,
    activeFilters,
    activeItemId,
    isBatchLoading,
    syncReviewLocation,
  ]);

  // Default ready-only view is empty but the batch has other work — open all.
  useEffect(() => {
    const shouldAutoBroaden =
      activeBatch &&
      activeBatch.status !== BatchStatus.CANCELLED &&
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
  }, [activeBatch, activeFilters, filterCounts, notifications]);

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
        activeBatch?.items ?? [],
        filters,
      );
      const nextItemId = getNextActiveItemId(nextVisibleItems, activeItemId);

      setActiveFilters(filters);
      setActiveItemId(nextItemId);
    },
    [activeBatch?.items, activeItemId],
  );

  const handleBulkAction = useCallback(
    async (action: 'approve' | 'reject') => {
      if (selectedIds.size === 0 || !activeBatchId) {
        return;
      }

      const selectedItemIds = Array.from(selectedIds);
      const remainingItems = visibleItems.filter(
        (item) => !selectedIds.has(item.id),
      );

      setIsActioning(true);
      try {
        const service = await getBatchesService();
        await service.itemAction(activeBatchId, {
          action,
          itemIds: selectedItemIds,
        });

        setSelectedIds(new Set());
        await refreshBatch();
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
      activeBatchId,
      activeItemId,
      getBatchesService,
      refreshBatch,
      selectedIds,
      visibleItems,
    ],
  );

  const updateBatchCaches = useCallback(
    (batch: IBatchSummary) => {
      queryClient.setQueryData(['review-batch', batch.id], batch);
      queryClient.setQueryData<IBatchSummary[]>(
        ['review-batches'],
        (currentBatches) =>
          currentBatches?.map((currentBatch) =>
            currentBatch.id === batch.id ? batch : currentBatch,
          ) ?? [batch],
      );
    },
    [queryClient],
  );

  const executeDiscardBatch = useCallback(
    async (batchId: string, reviewableItemIds: string[]) => {
      setIsActioning(true);
      let rejectedBatch: IBatchSummary | null = null;

      try {
        const service = await getBatchesService();

        if (reviewableItemIds.length > 0) {
          rejectedBatch = await service.itemAction(batchId, {
            action: 'reject',
            feedback: 'Review batch discarded.',
            itemIds: reviewableItemIds,
          });
        }

        const cancelledBatch = await service.cancelBatch(batchId);
        updateBatchCaches(cancelledBatch);
        setSelectedIds(new Set());
        setActiveItemId(null);
        setActiveFilters(DEFAULT_STATUS_FILTERS);
        notifications.success('Review batch discarded');
      } catch (error) {
        if (rejectedBatch) {
          updateBatchCaches(rejectedBatch);
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
    [getBatchesService, notifications, refreshQueue, updateBatchCaches],
  );

  const handleDiscardBatch = useCallback(() => {
    if (!activeBatch || !canDiscardBatch || isActioning) {
      return;
    }

    const reviewableItemIds = activeBatch.items
      .filter((item) => isReadyToReview(item))
      .map((item) => item.id);

    openConfirm({
      confirmLabel: 'Discard batch',
      isError: true,
      label: 'Discard review batch',
      message:
        'Ready drafts will be rejected and unfinished items will be cancelled. Prior review decisions stay unchanged. This action cannot be undone.',
      onConfirm: () => executeDiscardBatch(activeBatch.id, reviewableItemIds),
    });
  }, [
    activeBatch,
    canDiscardBatch,
    executeDiscardBatch,
    isActioning,
    openConfirm,
  ]);

  const handleApproveItem = useCallback(
    async (itemId: string) => {
      if (!activeBatchId) {
        return;
      }

      const approvedItem =
        activeBatch?.items.find((item) => item.id === itemId) ?? null;
      const remainingItems = visibleItems.filter((item) => item.id !== itemId);

      setIsActioning(true);
      try {
        const service = await getBatchesService();
        await service.itemAction(activeBatchId, {
          action: 'approve',
          itemIds: [itemId],
        });

        await refreshBatch();
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
    [activeBatch, activeBatchId, getBatchesService, refreshBatch, visibleItems],
  );

  const handleRequestChanges = useCallback(
    async (itemId: string, feedback?: string) => {
      if (!activeBatchId) {
        return;
      }

      const remainingItems = visibleItems.filter((item) => item.id !== itemId);

      setIsActioning(true);
      try {
        const service = await getBatchesService();
        await service.itemAction(activeBatchId, {
          action: 'request_changes',
          feedback,
          itemIds: [itemId],
        });

        await refreshBatch();
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
    [activeBatchId, getBatchesService, refreshBatch, visibleItems],
  );

  const handleAssignItem = useCallback(
    async (itemId: string, assigneeId: string) => {
      if (!activeBatchId) {
        return;
      }

      setIsActioning(true);
      try {
        const service = await getBatchesService();
        const batch = await service.assignItem(
          activeBatchId,
          itemId,
          assigneeId,
        );
        updateBatchCaches(batch);
      } catch (error) {
        logger.error('Assign review item failed', error);
      } finally {
        setIsActioning(false);
      }
    },
    [activeBatchId, getBatchesService, updateBatchCaches],
  );

  const handleUnassignItem = useCallback(
    async (itemId: string) => {
      if (!activeBatchId) {
        return;
      }

      setIsActioning(true);
      try {
        const service = await getBatchesService();
        const batch = await service.unassignItem(activeBatchId, itemId);
        updateBatchCaches(batch);
      } catch (error) {
        logger.error('Unassign review item failed', error);
      } finally {
        setIsActioning(false);
      }
    },
    [activeBatchId, getBatchesService, updateBatchCaches],
  );

  const handleRejectItem = useCallback(
    async (itemId: string, feedback?: string) => {
      if (!activeBatchId) {
        return;
      }

      const remainingItems = visibleItems.filter((item) => item.id !== itemId);

      setIsActioning(true);
      try {
        const service = await getBatchesService();
        await service.itemAction(activeBatchId, {
          action: 'reject',
          feedback,
          itemIds: [itemId],
        });

        await refreshBatch();
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
    [activeBatchId, getBatchesService, refreshBatch, visibleItems],
  );

  const handleBatchChange = useCallback((value: string) => {
    setSelectedBatchId(value);
    setActiveItemId(null);
    setSelectedIds(new Set());
    setActiveFilters(DEFAULT_STATUS_FILTERS);
  }, []);

  return {
    activeFilters,
    activeItem,
    activeBatch,
    activeBatchError,
    activeBatchId,
    batchList,
    batchesError,
    canDiscardBatch,
    filterCounts,
    hasInvalidBatchPayload,
    isActioning,
    isBatchesLoading,
    isBatchLoading,
    isRefreshing: isBatchesFetching || isBatchFetching,
    refreshQueue,
    selectedIds,
    selectedPostId,
    visibleItems,
    handleApproveItem,
    handleAssignItem,
    handleBatchChange,
    handleBulkAction,
    handleDiscardBatch,
    handleFilterChange,
    handleRequestChanges,
    handleRejectItem,
    handleSelectItem,
    handleToggleSelect,
    handleUnassignItem,
    setSelectedPostId,
  };
}
