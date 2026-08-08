import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { BatchesService } from '@services/batch/batches.service';
import { logger } from '@services/core/logger.service';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

export function useReviewQueueContent() {
  const getBatchesService = useAuthedService((token: string) =>
    BatchesService.getInstance(token),
  );
  const pathname = usePathname();
  const { replace } = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const requestedBatchId = searchParams.get('batch');
  const requestedFilters = parseReviewFilters(searchParams.get('filter'));
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
      const params = new URLSearchParams(searchParamsString);
      const nextBatchId = input.batchId ?? activeBatchId;
      const nextFilters = input.filters ?? activeFilters;
      const nextItemId =
        input.itemId === undefined ? activeItemId : (input.itemId ?? null);

      if (nextBatchId) {
        params.set('batch', nextBatchId);
      } else {
        params.delete('batch');
      }

      params.set('filter', serializeReviewFilters(nextFilters));

      if (nextItemId) {
        params.set('item', nextItemId);
      } else {
        params.delete('item');
      }

      const nextQuery = params.toString();
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

  useEffect(() => {
    if (
      requestedFilters &&
      !areReviewFiltersEqual(requestedFilters, activeFilters)
    ) {
      setActiveFilters(requestedFilters);
    }
  }, [activeFilters, requestedFilters]);

  useEffect(() => {
    if (requestedItemId && requestedItemId !== activeItemId) {
      setActiveItemId(requestedItemId);
    }
  }, [activeItemId, requestedItemId]);

  useEffect(() => {
    if (!requestedBatchId && activeBatchId) {
      syncReviewLocation({ batchId: activeBatchId });
    }
  }, [activeBatchId, requestedBatchId, syncReviewLocation]);

  useEffect(() => {
    // Default ready-only view is empty but the batch has other work — open all.
    if (
      activeBatch &&
      activeFilters.length === 1 &&
      activeFilters[0] === 'ready' &&
      filterCounts.ready === 0 &&
      filterCounts.all > 0
    ) {
      setActiveFilters([]);
      syncReviewLocation({ filters: [], itemId: activeItemId });
    }
  }, [
    activeBatch,
    activeFilters,
    activeItemId,
    filterCounts,
    syncReviewLocation,
  ]);

  useEffect(() => {
    if (
      requestedItemId &&
      activeBatchId === requestedBatchId &&
      visibleItems.some((item) => item.id === requestedItemId)
    ) {
      setActiveItemId((current) =>
        current === requestedItemId ? current : requestedItemId,
      );
      return;
    }

    if (visibleItems.length === 0) {
      setActiveItemId(null);
      syncReviewLocation({ itemId: null });
      return;
    }

    if (
      !activeItemId ||
      !visibleItems.some((item) => item.id === activeItemId)
    ) {
      const nextItemId = visibleItems[0]?.id ?? null;
      setActiveItemId(nextItemId);
      syncReviewLocation({ itemId: nextItemId });
    }
  }, [
    activeBatchId,
    activeItemId,
    requestedBatchId,
    requestedItemId,
    syncReviewLocation,
    visibleItems,
  ]);

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

  const handleSelectItem = useCallback(
    (itemId: string) => {
      setActiveItemId(itemId);
      syncReviewLocation({ itemId });
    },
    [syncReviewLocation],
  );

  const handleFilterChange = useCallback(
    (filters: ReviewStatusFilter[]) => {
      const nextVisibleItems = getVisibleReviewItems(
        activeBatch?.items ?? [],
        filters,
      );
      const nextItemId = getNextActiveItemId(nextVisibleItems, null);

      setActiveFilters(filters);
      setActiveItemId(nextItemId);
      syncReviewLocation({ filters, itemId: nextItemId });
    },
    [activeBatch?.items, syncReviewLocation],
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
        syncReviewLocation({ itemId: nextItemId });
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
      syncReviewLocation,
      visibleItems,
    ],
  );

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
          const nextItemId = getNextActiveItemId(remainingItems, itemId);
          setActiveItemId(nextItemId);
          syncReviewLocation({ itemId: nextItemId });
          return;
        }

        const nextItemId = getNextActiveItemId(remainingItems, itemId);
        setActiveItemId(nextItemId);
        syncReviewLocation({ itemId: nextItemId });
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
    [
      activeBatch,
      activeBatchId,
      getBatchesService,
      refreshBatch,
      syncReviewLocation,
      visibleItems,
    ],
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
        syncReviewLocation({ itemId: nextItemId });
      } catch (error) {
        logger.error('Request changes failed', error);
      } finally {
        setIsActioning(false);
      }
    },
    [
      activeBatchId,
      getBatchesService,
      refreshBatch,
      syncReviewLocation,
      visibleItems,
    ],
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
        syncReviewLocation({ itemId: nextItemId });
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
    [
      activeBatchId,
      getBatchesService,
      refreshBatch,
      syncReviewLocation,
      visibleItems,
    ],
  );

  const handleBatchChange = useCallback(
    (value: string) => {
      setSelectedBatchId(value);
      setActiveItemId(null);
      setSelectedIds(new Set());
      setActiveFilters(DEFAULT_STATUS_FILTERS);
      syncReviewLocation({
        batchId: value,
        filters: DEFAULT_STATUS_FILTERS,
        itemId: null,
      });
    },
    [syncReviewLocation],
  );

  return {
    activeFilters,
    activeItem,
    activeBatch,
    activeBatchError,
    activeBatchId,
    batchList,
    batchesError,
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
    handleBatchChange,
    handleBulkAction,
    handleFilterChange,
    handleRequestChanges,
    handleRejectItem,
    handleSelectItem,
    handleToggleSelect,
    setSelectedPostId,
  };
}
