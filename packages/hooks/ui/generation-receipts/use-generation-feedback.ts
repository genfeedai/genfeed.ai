'use client';

import type {
  BrandedGenerationFeedbackInputV1,
  BrandedGenerationFeedbackReadV1,
} from '@genfeedai/contracts/api-types/contracts/branded-generation-feedback.contract';
import type {
  GenerationFeedbackProps,
  GenerationFeedbackState,
} from '@genfeedai/props/content/branded-generation-receipt.props';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { BrandedGenerationReceiptsService } from '@services/ai/branded-generation-receipts.service';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

function unrated(receiptId: string): BrandedGenerationFeedbackReadV1 {
  return {
    id: receiptId,
    implicit: {
      isDiscarded: false,
      isEdited: null,
      postStatus: null,
      reviewDecision: null,
    },
    ratedAt: null,
    rating: null,
    reasons: [],
    receiptId,
  };
}
type Rating = BrandedGenerationFeedbackInputV1['rating'];
type Reason = BrandedGenerationFeedbackInputV1['reasons'][number];

/** The change being saved for one receipt, over its cached saved rating. */
interface FeedbackWrite {
  hasError: boolean;
  isSaving: boolean;
  optimistic: BrandedGenerationFeedbackReadV1 | null;
  scope: string;
}

const IDLE_WRITE: FeedbackWrite = {
  hasError: false,
  isSaving: false,
  optimistic: null,
  scope: '',
};

function createReceiptsService(token: string) {
  return BrandedGenerationReceiptsService.getInstance(token);
}

/**
 * The caller's thumbs on one generation. The saved rating is cached per brand
 * and receipt, so reopening a generation shows it at once and refreshes it in
 * the background. Changes show at once and are saved in the background; the
 * newest change wins, and a failed save restores the last saved rating.
 */
export function useGenerationFeedback({
  brandId,
  receiptId,
}: GenerationFeedbackProps): GenerationFeedbackState {
  const queryClient = useQueryClient();
  const getService = useAuthedService(createReceiptsService);
  const scope = `${brandId}\u0001${receiptId}`;
  const savedQuery = useAuthedQuery({
    queryFn: (service, signal) =>
      service.getFeedback(brandId, receiptId, signal),
    queryKey: ['generation-feedback', brandId, receiptId],
    service: createReceiptsService,
  });
  // A failed read hides an earlier choice but never blocks a new rating; a
  // failed background refresh keeps the saved rating on screen.
  const saved =
    savedQuery.data ?? (savedQuery.isError ? unrated(receiptId) : null);
  const [storedWrite, setWrite] = useState<FeedbackWrite>(IDLE_WRITE);
  const write = storedWrite.scope === scope ? storedWrite : IDLE_WRITE;
  const feedback = write.optimistic ?? saved;
  const latest = useRef(feedback);
  latest.current = feedback;
  const writeVersion = useRef(0);

  const save = useCallback(
    async (
      next: Pick<BrandedGenerationFeedbackInputV1, 'rating' | 'reasons'> | null,
    ) => {
      const version = ++writeVersion.current;
      const base = latest.current;
      const savedKey = ['generation-feedback', brandId, receiptId];
      setWrite({
        hasError: false,
        isSaving: true,
        optimistic: base
          ? {
              ...base,
              rating: next?.rating ?? null,
              reasons: next?.reasons ?? [],
            }
          : null,
        scope,
      });
      try {
        const service = await getService();
        if (next) {
          const result = await service.rateFeedback(brandId, receiptId, next);
          if (version !== writeVersion.current) return;
          queryClient.setQueriesData<BrandedGenerationFeedbackReadV1>(
            { queryKey: savedKey },
            () => result,
          );
        } else {
          await service.withdrawFeedback(brandId, receiptId);
          if (version !== writeVersion.current) return;
          queryClient.setQueriesData<BrandedGenerationFeedbackReadV1>(
            { queryKey: savedKey },
            (cached) => {
              const cleared = cached ?? base;
              return cleared
                ? { ...cleared, rating: null, ratedAt: null, reasons: [] }
                : undefined;
            },
          );
        }
        setWrite({ ...IDLE_WRITE, scope });
      } catch {
        if (version !== writeVersion.current) return;
        setWrite({ ...IDLE_WRITE, hasError: true, scope });
      }
    },
    [brandId, receiptId, getService, queryClient, scope],
  );

  const rate = useCallback(
    (rating: Rating) => {
      const current = latest.current;
      if (!current) return;
      void save(current.rating === rating ? null : { rating, reasons: [] });
    },
    [save],
  );

  const toggleReason = useCallback(
    (reason: Reason) => {
      const current = latest.current;
      if (current?.rating !== 'down') return;
      const reasons = current.reasons.includes(reason)
        ? current.reasons.filter((value) => value !== reason)
        : [...current.reasons, reason];
      void save({ rating: 'down', reasons });
    },
    [save],
  );

  return {
    feedback,
    hasError: write.hasError,
    isSaving: write.isSaving,
    rate,
    toggleReason,
  };
}
