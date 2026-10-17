'use client';

import type {
  BrandedGenerationFeedbackInputV1,
  BrandedGenerationFeedbackReadV1,
} from '@genfeedai/contracts/api-types/contracts/branded-generation-feedback.contract';
import type {
  GenerationFeedbackProps,
  GenerationFeedbackState,
} from '@genfeedai/props/content/branded-generation-receipt.props';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { BrandedGenerationReceiptsService } from '@services/ai/branded-generation-receipts.service';
import { useCallback, useEffect, useRef, useState } from 'react';

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

/**
 * The caller's thumbs on one generation. Changes show at once and are saved in
 * the background; the newest change wins, and a failed save restores the last
 * saved rating.
 */
export function useGenerationFeedback({
  brandId,
  receiptId,
}: GenerationFeedbackProps): GenerationFeedbackState {
  const getService = useAuthedService((token) =>
    BrandedGenerationReceiptsService.getInstance(token),
  );
  const [feedback, setFeedback] =
    useState<BrandedGenerationFeedbackReadV1 | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasError, setHasError] = useState(false);
  const saved = useRef<BrandedGenerationFeedbackReadV1 | null>(null);
  const latest = useRef(feedback);
  latest.current = feedback;
  const writeVersion = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    saved.current = null;
    writeVersion.current += 1;
    setFeedback(null);
    setHasError(false);
    void (async () => {
      try {
        const service = await getService();
        const result = await service.getFeedback(
          brandId,
          receiptId,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        saved.current = result;
        setFeedback(result);
      } catch {
        // A failed read hides an earlier choice but never blocks a new rating.
        if (controller.signal.aborted) return;
        saved.current = unrated(receiptId);
        setFeedback(saved.current);
      }
    })();
    return () => controller.abort();
  }, [brandId, receiptId, getService]);

  const save = useCallback(
    async (
      next: Pick<BrandedGenerationFeedbackInputV1, 'rating' | 'reasons'> | null,
    ) => {
      const version = ++writeVersion.current;
      const base = latest.current;
      setHasError(false);
      setIsSaving(true);
      setFeedback((previous) =>
        previous
          ? {
              ...previous,
              rating: next?.rating ?? null,
              reasons: next?.reasons ?? [],
            }
          : previous,
      );
      try {
        const service = await getService();
        if (next) {
          const result = await service.rateFeedback(brandId, receiptId, next);
          if (version !== writeVersion.current) return;
          saved.current = result;
          setFeedback(result);
        } else {
          await service.withdrawFeedback(brandId, receiptId);
          if (version !== writeVersion.current) return;
          const cleared = saved.current ?? base;
          saved.current = cleared
            ? { ...cleared, rating: null, ratedAt: null, reasons: [] }
            : cleared;
        }
      } catch {
        if (version !== writeVersion.current) return;
        setFeedback(saved.current);
        setHasError(true);
      } finally {
        if (version === writeVersion.current) setIsSaving(false);
      }
    },
    [brandId, receiptId, getService],
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

  return { feedback, hasError, isSaving, rate, toggleReason };
}
