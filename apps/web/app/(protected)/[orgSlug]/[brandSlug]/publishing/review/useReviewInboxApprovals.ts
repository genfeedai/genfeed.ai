import type {
  IReviewInboxItem,
  ReviewInboxDecision,
  ReviewInboxItemSource,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isCollectionFetchReady,
  toBrandListParams,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { ReviewInboxService } from '@services/content/review-inbox.service';
import { getJsonApiErrorMessage } from '@services/core/json-api-error-message';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import type { ReviewInboxApprovalsState } from '@/props/publishing/review-inbox-approvals.props';
import { searchReviewInboxItems } from './components/review-inbox.helpers';

/** Turbo run drafts are agent work, so they show for the Agent source. */
export function isAgentSourceVisible(
  sources: readonly ReviewInboxItemSource[],
): boolean {
  return sources.length === 0 || sources.includes('agent');
}

export function filterReviewInboxItems(
  items: readonly IReviewInboxItem[],
  sources: readonly ReviewInboxItemSource[],
): IReviewInboxItem[] {
  return sources.length === 0
    ? [...items]
    : items.filter((item) => sources.includes(item.source));
}

/**
 * Workflow review gates and MCP approvals for the review inbox (#7340). Each
 * decision goes to the API once; the owning service fences repeats.
 */
export function useReviewInboxApprovals(
  search = '',
): ReviewInboxApprovalsState {
  const translate = useTranslations('pages.publishing.review.inbox');
  const notifications = useMemo(() => NotificationsService.getInstance(), []);
  const getReviewInboxService = useAuthedService((token: string) =>
    ReviewInboxService.getInstance(token),
  );
  const collectionScope = useCollectionScope();
  const { brandId, organizationId } = collectionScope;
  const isScopeReady = isCollectionFetchReady(collectionScope);
  const highlightedItemId = useSearchParams().get('approval');
  const [sourceFilters, setSourceFilters] = useState<ReviewInboxItemSource[]>(
    [],
  );
  const [decidingItemId, setDecidingItemId] = useState<string | null>(null);
  const [isBulkDeciding, setIsBulkDeciding] = useState(false);

  const {
    data: rawItems,
    error,
    isLoading: isQueryLoading,
    refetch,
  } = useQuery({
    enabled: isScopeReady,
    queryFn: async ({ signal }) => {
      const service = await getReviewInboxService();
      return service.getPendingItems(toBrandListParams({ brandId }), signal);
    },
    // The page's own org and brand, so a brand switch never shows a stale inbox.
    queryKey: ['review-inbox', organizationId, brandId],
  });

  const isLoading = !isScopeReady || isQueryLoading;
  const data = useMemo(
    () => (Array.isArray(rawItems) ? rawItems : []),
    [rawItems],
  );
  const items = useMemo(
    () =>
      searchReviewInboxItems(
        filterReviewInboxItems(data, sourceFilters),
        search,
      ),
    [data, search, sourceFilters],
  );

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const onDecide = useCallback(
    async (item: IReviewInboxItem, decision: ReviewInboxDecision) => {
      if (decidingItemId || isBulkDeciding) return;
      setDecidingItemId(item.id);
      try {
        const service = await getReviewInboxService();
        await service.decide({ decision, itemId: item.id });
        notifications.success(
          decision === 'reject'
            ? translate('rejected')
            : item.kind === 'mcp_approval'
              ? translate('mcpApproved')
              : translate('approved'),
        );
      } catch (decisionError: unknown) {
        logger.error('Review inbox decision failed', decisionError);
        notifications.error(
          getJsonApiErrorMessage(decisionError, translate('decisionFailed')),
        );
      } finally {
        setDecidingItemId(null);
        // Resolved or raced elsewhere, the row's truth is the server's.
        await refetch();
      }
    },
    [
      decidingItemId,
      getReviewInboxService,
      isBulkDeciding,
      notifications,
      refetch,
      translate,
    ],
  );

  const onDecideMany = useCallback(
    async (
      selected: readonly IReviewInboxItem[],
      decision: ReviewInboxDecision,
    ) => {
      if (decidingItemId || isBulkDeciding || selected.length === 0) return;
      setIsBulkDeciding(true);
      try {
        const service = await getReviewInboxService();
        // The owning service still fences each decision; failures come back
        // per item instead of aborting the batch.
        const { decided, failed } = await service.decideMany({
          decision,
          itemIds: selected.map((item) => item.id),
        });
        const decidedCount = decided.length;
        const failedCount = failed.length;
        if (failedCount === 0) {
          notifications.success(
            translate(decision === 'reject' ? 'bulkRejected' : 'bulkApproved', {
              count: decidedCount,
            }),
          );
        } else {
          notifications.error(
            translate('bulkPartial', {
              count: decidedCount,
              failed: failedCount,
            }),
          );
        }
      } catch (serviceError: unknown) {
        logger.error('Review inbox bulk decision failed', serviceError);
        notifications.error(
          getJsonApiErrorMessage(serviceError, translate('decisionFailed')),
        );
      } finally {
        setIsBulkDeciding(false);
        await refetch();
      }
    },
    [
      decidingItemId,
      getReviewInboxService,
      isBulkDeciding,
      notifications,
      refetch,
      translate,
    ],
  );

  return {
    decidingItemId,
    error: error instanceof Error ? error : null,
    highlightedItemId,
    isHighlightedItemMissing:
      Boolean(highlightedItemId) &&
      !isLoading &&
      !error &&
      !data.some((item) => item.id === highlightedItemId),
    isBulkDeciding,
    isLoading,
    items,
    onDecide,
    onDecideMany,
    onSourceFilterChange: setSourceFilters,
    refresh,
    sourceFilters,
  };
}
