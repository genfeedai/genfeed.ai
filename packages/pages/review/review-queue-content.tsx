'use client';

import type { IBatchItem, IBatchSummary } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import PostDetailOverlay from '@pages/posts/detail/PostDetailOverlay';
import ReviewGrid, {
  getReviewFilterCounts,
  getVisibleReviewItems,
  type ReviewFilter,
} from '@pages/review/components/ReviewGrid';
import ReviewStatsHeader from '@pages/review/components/ReviewStatsHeader';
import { isReadyToReview } from '@pages/review/components/review-state';
import { BatchesService } from '@services/batch/batches.service';
import { logger } from '@services/core/logger.service';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { PageScope } from '@ui-constants/misc.constant';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HiOutlineClipboardDocumentCheck,
  HiOutlineExclamationTriangle,
} from 'react-icons/hi2';

function getBatchOptionLabel(batch: IBatchSummary): string {
  return `Batch ${batch.id.slice(-6)} - ${batch.totalCount} items (${batch.status})`;
}

function getNextActiveItemId(
  items: IBatchItem[],
  currentItemId: string | null,
): string | null {
  if (items.length === 0) {
    return null;
  }

  if (!currentItemId) {
    return items[0]?.id ?? null;
  }

  const currentIndex = items.findIndex((item) => item.id === currentItemId);

  if (currentIndex === -1) {
    return items[0]?.id ?? null;
  }

  return items[currentIndex + 1]?.id ?? items[currentIndex - 1]?.id ?? null;
}

function parseReviewFilter(value: string | null): ReviewFilter | null {
  if (
    value === 'ready' ||
    value === 'approved' ||
    value === 'changes_requested' ||
    value === 'failed' ||
    value === 'pending' ||
    value === 'skipped' ||
    value === 'all'
  ) {
    return value;
  }

  return null;
}

export default function ReviewQueueContent() {
  const getBatchesService = useAuthedService((token: string) =>
    BatchesService.getInstance(token),
  );
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedBatchId = searchParams.get('batch');
  const requestedFilter = parseReviewFilter(searchParams.get('filter'));
  const requestedItemId = searchParams.get('item');

  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(
    requestedBatchId,
  );
  const [activeFilter, setActiveFilter] = useState<ReviewFilter>(
    requestedFilter ?? 'ready',
  );
  const [activeItemId, setActiveItemId] = useState<string | null>(
    requestedItemId,
  );
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isActioning, setIsActioning] = useState(false);

  const {
    data: batches,
    error: batchesError,
    isLoading: isBatchesLoading,
  } = useResource<IBatchSummary[]>(
    async () => {
      const service = await getBatchesService();
      return service.getBatches();
    },
    { defaultValue: [] },
  );

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
      filter?: ReviewFilter;
      itemId?: string | null;
    }) => {
      const params = new URLSearchParams(searchParams.toString());
      const nextBatchId = input.batchId ?? activeBatchId;
      const nextFilter = input.filter ?? activeFilter;
      const nextItemId =
        input.itemId === undefined ? activeItemId : (input.itemId ?? null);

      if (nextBatchId) {
        params.set('batch', nextBatchId);
      } else {
        params.delete('batch');
      }

      params.set('filter', nextFilter);

      if (nextItemId) {
        params.set('item', nextItemId);
      } else {
        params.delete('item');
      }

      const nextQuery = params.toString();
      const nextHref = nextQuery ? `${pathname}?${nextQuery}` : pathname;
      router.replace(nextHref, { scroll: false });
    },
    [activeBatchId, activeFilter, activeItemId, pathname, router, searchParams],
  );

  const {
    data: activeBatch,
    error: activeBatchError,
    isLoading: isBatchLoading,
    refresh: refreshBatch,
  } = useResource<IBatchSummary>(
    async () => {
      const service = await getBatchesService();
      return service.getBatch(activeBatchId!);
    },
    {
      dependencies: [activeBatchId],
      enabled: !!activeBatchId,
    },
  );

  const actionableItems = useMemo(
    () => activeBatch?.items.filter((item) => isReadyToReview(item)) ?? [],
    [activeBatch],
  );

  const filterCounts = useMemo(
    () => getReviewFilterCounts(activeBatch?.items ?? []),
    [activeBatch?.items],
  );

  const visibleItems = useMemo(
    () => getVisibleReviewItems(activeBatch?.items ?? [], activeFilter),
    [activeBatch?.items, activeFilter],
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
    if (requestedFilter && requestedFilter !== activeFilter) {
      setActiveFilter(requestedFilter);
    }
  }, [activeFilter, requestedFilter]);

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
    if (
      activeBatch &&
      activeFilter === 'ready' &&
      filterCounts.ready === 0 &&
      filterCounts.all > 0
    ) {
      setActiveFilter('all');
      syncReviewLocation({ filter: 'all', itemId: activeItemId });
    }
  }, [
    activeBatch,
    activeFilter,
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
    (filter: ReviewFilter) => {
      const nextVisibleItems = getVisibleReviewItems(
        activeBatch?.items ?? [],
        filter,
      );
      const nextItemId = getNextActiveItemId(nextVisibleItems, null);

      setActiveFilter(filter);
      setActiveItemId(nextItemId);
      syncReviewLocation({ filter, itemId: nextItemId });
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
      } catch (error) {
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
      setActiveFilter('ready');
      syncReviewLocation({ batchId: value, filter: 'ready', itemId: null });
    },
    [syncReviewLocation],
  );

  if (isBatchesLoading) {
    return <Loading />;
  }

  return (
    <Container
      label="Publishing Inbox"
      description="Review generated assets and drafts before posting."
      icon={HiOutlineClipboardDocumentCheck}
      right={
        batchList.length > 0 ? (
          <Select value={activeBatchId ?? ''} onValueChange={handleBatchChange}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select batch" />
            </SelectTrigger>
            <SelectContent>
              {batchList.map((batch) => (
                <SelectItem key={batch.id} value={batch.id}>
                  {getBatchOptionLabel(batch)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : undefined
      }
    >
      {batchesError || hasInvalidBatchPayload ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/5 py-16 text-center">
          <HiOutlineExclamationTriangle className="mb-3 h-10 w-10 text-rose-400" />
          <p className="text-sm font-medium text-rose-100">
            Unable to load the review queue
          </p>
          <p className="mt-1 max-w-md text-xs text-rose-200/70">
            The review batches response was invalid or failed to load. Refresh
            the page and check the batches API response shape.
          </p>
        </div>
      ) : batchList.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900/50 py-16">
          <HiOutlineClipboardDocumentCheck className="mb-3 h-10 w-10 text-neutral-600" />
          <p className="text-sm text-neutral-500">No review work waiting</p>
          <p className="mt-1 text-xs text-neutral-600">
            Approved assets will appear here when they are ready to post
          </p>
        </div>
      ) : (
        <>
          <ReviewStatsHeader batch={activeBatch} isLoading={isBatchLoading} />

          {isBatchLoading ? (
            <Loading />
          ) : activeBatchError ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/5 py-16 text-center">
              <HiOutlineExclamationTriangle className="mb-3 h-10 w-10 text-amber-400" />
              <p className="text-sm font-medium text-amber-100">
                Unable to load the selected batch
              </p>
              <p className="mt-1 max-w-md text-xs text-amber-200/70">
                The batch list loaded, but the selected batch details could not
                be retrieved.
              </p>
            </div>
          ) : activeBatch ? (
            <ReviewGrid
              activeFilter={activeFilter}
              activeItem={activeItem}
              batch={activeBatch}
              filterCounts={filterCounts}
              isActioning={isActioning}
              items={visibleItems}
              selectedIds={selectedIds}
              onApprove={handleApproveItem}
              onBulkApprove={() => handleBulkAction('approve')}
              onBulkReject={() => handleBulkAction('reject')}
              onFilterChange={handleFilterChange}
              onRequestChanges={handleRequestChanges}
              onReject={handleRejectItem}
              onSelectItem={handleSelectItem}
              onToggleSelect={handleToggleSelect}
            />
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/5 py-16 text-center">
              <HiOutlineExclamationTriangle className="mb-3 h-10 w-10 text-amber-400" />
              <p className="text-sm font-medium text-amber-100">
                No batch details are available
              </p>
              <p className="mt-1 max-w-md text-xs text-amber-200/70">
                The selected batch could not be resolved. Pick another batch or
                reload the queue.
              </p>
            </div>
          )}
        </>
      )}
      <PostDetailOverlay
        postId={selectedPostId}
        scope={PageScope.PUBLISHER}
        onClose={() => setSelectedPostId(null)}
      />
    </Container>
  );
}
