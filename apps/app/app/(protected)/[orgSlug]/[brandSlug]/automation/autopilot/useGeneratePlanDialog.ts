import type { IWeeklyPerformanceSummary } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { GeneratePlanFormState } from '@props/automation/content-plans-section.props';
import { ContentPerformanceService } from '@services/analytics/content-performance.service';
import { logger } from '@services/core/logger.service';
import { addDays, format } from 'date-fns';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

function buildDefaultFormState(): GeneratePlanFormState {
  const today = new Date();

  return {
    itemCount: '7',
    periodEnd: format(addDays(today, 7), 'yyyy-MM-dd'),
    periodStart: format(today, 'yyyy-MM-dd'),
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

  const getPerformanceService = useAuthedService((token: string) =>
    ContentPerformanceService.getInstance(token),
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setForm(buildDefaultFormState());
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

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await onSubmit(form);
    },
    [form, onSubmit],
  );

  return { form, handleSubmit, isLoadingSummary, setForm, summary };
}
