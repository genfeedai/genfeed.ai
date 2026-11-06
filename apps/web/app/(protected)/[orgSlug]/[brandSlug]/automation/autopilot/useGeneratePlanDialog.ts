import { SocialSourceType } from '@genfeedai/contracts';
import type {
  IContentPlanSeedPreview,
  IWeeklyPerformanceSummary,
} from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { ContentPerformanceService } from '@services/analytics/content-performance.service';
import { ContentPlansService } from '@services/content/content-plans.service';
import { logger } from '@services/core/logger.service';
import { addDays, format } from 'date-fns';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {
  GeneratePlanFormState,
  UseGeneratePlanDialogOptions,
} from '@/features/automation/props/content-plans-section.props';

export type { UseGeneratePlanDialogOptions } from '@/features/automation/props/content-plans-section.props';

function buildDefaultFormState(): GeneratePlanFormState {
  const today = new Date();

  return {
    advertiserIds: [],
    isImportedHistoryIncluded: true,
    isPatternsIncluded: true,
    itemCount: '7',
    periodEnd: format(addDays(today, 7), 'yyyy-MM-dd'),
    periodStart: format(today, 'yyyy-MM-dd'),
    sourceIds: [],
    topics: '',
  };
}

export function useGeneratePlanDialog({
  brandId,
  isOpen,
  onSubmit,
}: UseGeneratePlanDialogOptions) {
  const [form, setForm] = useState<GeneratePlanFormState>(
    buildDefaultFormState(),
  );
  // Set once the user ticks or unticks a seed; a later read of the seeds
  // (the first one, or a background refresh) then leaves the choice alone.
  const isSeedSelectionEditedRef = useRef(false);

  // Both reads are cached per viewer and brand, so reopening the dialog shows
  // the dataset confidence and the seed picker at once and refreshes them in
  // the background. The summary shares the analytics overview key: without a
  // date range it is the same request.
  const summaryQuery = useAuthedQuery<
    ContentPerformanceService,
    IWeeklyPerformanceSummary | null
  >({
    enabled: isOpen && Boolean(brandId),
    queryFn: async (service, signal) => {
      if (!brandId) {
        throw new Error('weekly_summary_brand_required');
      }
      try {
        return (await service.getWeeklySummary({ brandId }, signal)) ?? null;
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to fetch weekly performance summary', error);
        }
        throw error;
      }
    },
    queryKey: ['weekly-performance-summary', brandId ?? null, null, null],
    service: (token: string) => ContentPerformanceService.getInstance(token),
  });
  const seedsQuery = useAuthedQuery<
    ContentPlansService,
    IContentPlanSeedPreview
  >({
    enabled: isOpen && Boolean(brandId),
    queryFn: async (service, signal) => {
      if (!brandId) {
        throw new Error('content_plan_seeds_brand_required');
      }
      try {
        return await service.getSeeds(brandId, signal);
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to fetch content plan seed preview', error);
        }
        throw error;
      }
    },
    queryKey: ['content-plan-seeds', brandId ?? null],
    service: (token: string) => ContentPlansService.getInstance(token),
  });
  const summary = summaryQuery.data ?? null;
  const isLoadingSummary = summaryQuery.isLoading;
  const seedPreview = seedsQuery.data ?? null;
  const isLoadingSeeds = seedsQuery.isLoading;

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    isSeedSelectionEditedRef.current = false;
    setForm(buildDefaultFormState());
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !seedPreview || isSeedSelectionEditedRef.current) {
      return;
    }
    // Default every advertiser/creator to checked, matching what a cold-start
    // plan would seed from without the caller picking anything.
    setForm((prev) => ({
      ...prev,
      advertiserIds: seedPreview.advertisers.map((advertiser) => advertiser.id),
      sourceIds: seedPreview.sources
        .filter((source) => source.sourceType !== SocialSourceType.OWN_ACCOUNT)
        .map((source) => source.id),
    }));
  }, [isOpen, seedPreview]);

  const toggleAdvertiser = useCallback(
    (advertiserId: string, isChecked: boolean) => {
      isSeedSelectionEditedRef.current = true;
      setForm((prev) => ({
        ...prev,
        advertiserIds: isChecked
          ? [...prev.advertiserIds, advertiserId]
          : prev.advertiserIds.filter((id) => id !== advertiserId),
      }));
    },
    [],
  );

  const toggleSource = useCallback((sourceId: string, isChecked: boolean) => {
    isSeedSelectionEditedRef.current = true;
    setForm((prev) => ({
      ...prev,
      sourceIds: isChecked
        ? [...prev.sourceIds, sourceId]
        : prev.sourceIds.filter((id) => id !== sourceId),
    }));
  }, []);

  const setIsImportedHistoryIncluded = useCallback((isChecked: boolean) => {
    setForm((prev) => ({ ...prev, isImportedHistoryIncluded: isChecked }));
  }, []);

  const setIsPatternsIncluded = useCallback((isChecked: boolean) => {
    setForm((prev) => ({ ...prev, isPatternsIncluded: isChecked }));
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await onSubmit(form);
    },
    [form, onSubmit],
  );

  return {
    form,
    handleSubmit,
    isLoadingSeeds,
    isLoadingSummary,
    seedPreview,
    setForm,
    setIsImportedHistoryIncluded,
    setIsPatternsIncluded,
    summary,
    toggleAdvertiser,
    toggleSource,
  };
}
