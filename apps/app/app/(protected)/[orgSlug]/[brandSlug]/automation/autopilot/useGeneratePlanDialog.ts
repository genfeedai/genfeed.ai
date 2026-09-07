import { SocialSourceType } from '@genfeedai/contracts';
import type {
  IContentPlanSeedPreview,
  IWeeklyPerformanceSummary,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { GeneratePlanFormState } from '@props/automation/content-plans-section.props';
import { ContentPerformanceService } from '@services/analytics/content-performance.service';
import { ContentPlansService } from '@services/content/content-plans.service';
import { logger } from '@services/core/logger.service';
import { addDays, format } from 'date-fns';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

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

export interface UseGeneratePlanDialogOptions {
  brandId?: string;
  isOpen: boolean;
  onSubmit: (form: GeneratePlanFormState) => Promise<void>;
}

export function useGeneratePlanDialog({
  brandId,
  isOpen,
  onSubmit,
}: UseGeneratePlanDialogOptions) {
  const [form, setForm] = useState<GeneratePlanFormState>(
    buildDefaultFormState(),
  );
  const [summary, setSummary] = useState<IWeeklyPerformanceSummary | null>(
    null,
  );
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [seedPreview, setSeedPreview] =
    useState<IContentPlanSeedPreview | null>(null);
  const [isLoadingSeeds, setIsLoadingSeeds] = useState(false);

  const getPerformanceService = useAuthedService((token: string) =>
    ContentPerformanceService.getInstance(token),
  );
  const getContentPlansService = useAuthedService((token: string) =>
    ContentPlansService.getInstance(token),
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setForm(buildDefaultFormState());
    setSeedPreview(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !brandId) {
      return;
    }

    const controller = new AbortController();
    setIsLoadingSummary(true);
    void (async () => {
      try {
        const service = await getPerformanceService();
        const data = await service.getWeeklySummary({ brandId });
        if (!controller.signal.aborted) {
          setSummary(data);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error('Failed to fetch weekly performance summary', error);
          setSummary(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingSummary(false);
        }
      }
    })();
    return () => controller.abort();
  }, [brandId, getPerformanceService, isOpen]);

  useEffect(() => {
    if (!isOpen || !brandId) {
      return;
    }

    const controller = new AbortController();
    setIsLoadingSeeds(true);
    void (async () => {
      try {
        const service = await getContentPlansService();
        const preview = await service.getSeeds(brandId, controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        setSeedPreview(preview);
        // Default every advertiser/creator to checked, matching what a
        // cold-start plan would seed from without the caller picking anything.
        setForm((prev) => ({
          ...prev,
          advertiserIds: preview.advertisers.map((advertiser) => advertiser.id),
          sourceIds: preview.sources
            .filter(
              (source) => source.sourceType !== SocialSourceType.OWN_ACCOUNT,
            )
            .map((source) => source.id),
        }));
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error('Failed to fetch content plan seed preview', error);
          setSeedPreview(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingSeeds(false);
        }
      }
    })();
    return () => controller.abort();
  }, [brandId, getContentPlansService, isOpen]);

  const toggleAdvertiser = useCallback(
    (advertiserId: string, isChecked: boolean) => {
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
