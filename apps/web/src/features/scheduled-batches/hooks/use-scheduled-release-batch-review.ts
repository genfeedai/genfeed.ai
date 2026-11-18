'use client';

import {
  buildReviewInboxItemId,
  type IReviewInboxDecisionResult,
  type IScheduledReleaseBatchReview,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isCollectionFetchReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { ReviewInboxService } from '@services/content/review-inbox.service';
import { getJsonApiErrorMessage } from '@services/core/json-api-error-message';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useRef, useState } from 'react';

export interface ScheduledReleaseBatchReviewState {
  review: IScheduledReleaseBatchReview | undefined;
  error: Error | null;
  isLoading: boolean;
  /** A decision request is in flight, so no other may start. */
  isDeciding: boolean;
  /** Approves the batch with the posts the reviewer kept. */
  approve: (removedIndexes: readonly number[]) => Promise<boolean>;
  decline: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

/**
 * One scheduled release batch an MCP client asked to schedule (#10134). The
 * approval carries the reviewer's own list of removed posts, so a week is
 * never scheduled unread; the server then creates the posts itself.
 */
export function useScheduledReleaseBatchReview(
  approvalId: string,
): ScheduledReleaseBatchReviewState {
  const translate = useTranslations('pages.publishing.batch');
  const notifications = useMemo(() => NotificationsService.getInstance(), []);
  const queryClient = useQueryClient();
  const getService = useAuthedService((token: string) =>
    ReviewInboxService.getInstance(token),
  );
  const collectionScope = useCollectionScope();
  const { brandId, organizationId } = collectionScope;
  const [isDeciding, setIsDeciding] = useState(false);
  const isDecidingRef = useRef(false);

  const { data, error, isLoading, refetch } = useQuery({
    enabled: isCollectionFetchReady(collectionScope) && Boolean(approvalId),
    queryFn: async ({ signal }) => {
      const service = await getService();
      return service.getBatch(approvalId, signal);
    },
    queryKey: ['review-inbox-batch', organizationId, brandId, approvalId],
  });

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const decide = useCallback(
    async (
      decision: 'approve' | 'reject',
      removedIndexes: readonly number[],
    ): Promise<boolean> => {
      // A ref, not state: two calls before a render must not both submit.
      if (isDecidingRef.current) return false;
      isDecidingRef.current = true;
      setIsDeciding(true);
      try {
        const service = await getService();
        const result: IReviewInboxDecisionResult = await service.decide({
          decision,
          ...(decision === 'approve'
            ? { excludedIndexes: [...removedIndexes] }
            : {}),
          itemId: buildReviewInboxItemId({ approvalId, kind: 'mcp_approval' }),
        });
        if (decision === 'reject') {
          notifications.success(translate('declinedToast'));
        } else if (result.scheduled && result.scheduled.failed > 0) {
          notifications.error(
            translate('partialToast', {
              count: result.scheduled.created,
              failed: result.scheduled.failed,
            }),
          );
        } else {
          notifications.success(
            translate('scheduledToast', {
              count: result.scheduled?.created ?? 0,
            }),
          );
        }
        return true;
      } catch (decisionError: unknown) {
        logger.error('Scheduled release batch decision failed', decisionError);
        notifications.error(
          getJsonApiErrorMessage(decisionError, translate('decisionFailed')),
        );
        return false;
      } finally {
        isDecidingRef.current = false;
        setIsDeciding(false);
        // The page and the inbox row show what the server recorded.
        await Promise.all([
          refetch(),
          queryClient.invalidateQueries({ queryKey: ['review-inbox'] }),
        ]);
      }
    },
    [approvalId, getService, notifications, queryClient, refetch, translate],
  );

  const approve = useCallback(
    (removedIndexes: readonly number[]) => decide('approve', removedIndexes),
    [decide],
  );
  const decline = useCallback(() => decide('reject', []), [decide]);

  return {
    approve,
    decline,
    error: error instanceof Error ? error : null,
    isDeciding,
    isLoading,
    refresh,
    review: data,
  };
}
