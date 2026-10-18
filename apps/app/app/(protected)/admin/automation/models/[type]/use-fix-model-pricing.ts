'use client';

import type {
  AdminModelPricingRow,
  ModelPricingFixResult,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AdminModelPricingService } from '@services/admin/model-pricing.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef } from 'react';
import { ADMIN_MODEL_PRICING_QUERY_KEY } from './use-admin-model-pricing-report';

const MODELS_QUERY_KEY = ['studio-models'] as const;
/** Provider imports land asynchronously; look again for the rates they bring. */
const FOLLOW_UP_DELAY_MS = 15_000;
const MAX_FOLLOW_UPS = 8;

/** A model whose price is missing or whose provider rates await approval. */
export function canFixPricing(row: AdminModelPricingRow | undefined): boolean {
  return Boolean(
    row && (row.attentionLevel === 'red' || row.isRateApprovalAvailable),
  );
}

function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * "Fix pricing" for one model or all of them. Approves pending provider rates
 * and queues provider imports; for models still waiting on an import, keeps
 * looking for their rates for a couple of minutes and approves them on arrival
 * so one click finishes the job.
 */
export function useFixModelPricing() {
  const t = useTranslations('pages.adminModelPricing');
  const queryClient = useQueryClient();
  const getService = useAuthedService((token: string) =>
    AdminModelPricingService.getInstance(token),
  );
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const mutation = useMutation({
    mutationFn: async (modelIds?: string[]) =>
      (await getService()).fixPricing(modelIds),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: ADMIN_MODEL_PRICING_QUERY_KEY,
        }),
        queryClient.invalidateQueries({ queryKey: MODELS_QUERY_KEY }),
      ]),
  });

  const summarize = useCallback(
    (result: ModelPricingFixResult) => {
      const notifications = NotificationsService.getInstance();
      const parts = [
        result.approved.length
          ? t('fixSummaryApproved', { count: result.approved.length })
          : null,
        result.syncQueued.length
          ? t('fixSummarySyncQueued', { count: result.syncQueued.length })
          : null,
        result.changed.length
          ? t('fixSummaryChanged', { count: result.changed.length })
          : null,
        result.unresolved.length
          ? t('fixSummaryUnresolved', { count: result.unresolved.length })
          : null,
      ].filter((part): part is string => part !== null);
      if (parts.length === 0) notifications.success(t('fixNothing'));
      else if (result.unresolved.length || result.changed.length)
        notifications.error(parts.join(' '));
      else notifications.success(parts.join(' '));
    },
    [t],
  );

  const run = useCallback(
    async (modelIds?: string[]) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      let result: ModelPricingFixResult;
      try {
        result = await mutation.mutateAsync(modelIds);
      } catch {
        NotificationsService.getInstance().error(t('fixFailed'));
        return;
      }
      summarize(result);

      let waiting = result.syncQueued.map((entry) => entry.id);
      for (
        let attempt = 0;
        attempt < MAX_FOLLOW_UPS && waiting.length > 0;
        attempt += 1
      ) {
        await waitFor(FOLLOW_UP_DELAY_MS, controller.signal);
        if (controller.signal.aborted) return;
        const report = await queryClient.fetchQuery({
          queryFn: async ({ signal }) => (await getService()).getReport(signal),
          queryKey: ADMIN_MODEL_PRICING_QUERY_KEY,
          staleTime: 0,
        });
        const ready = report.rows
          .filter(
            (row) => waiting.includes(row.id) && row.isRateApprovalAvailable,
          )
          .map((row) => row.id);
        if (ready.length === 0) continue;
        waiting = waiting.filter((id) => !ready.includes(id));
        try {
          summarize(await mutation.mutateAsync(ready));
        } catch {
          NotificationsService.getInstance().error(t('fixFailed'));
          return;
        }
      }
    },
    [getService, mutation, queryClient, summarize, t],
  );

  return {
    fixAll: () => run(),
    fixModel: (modelId: string) => run([modelId]),
    isFixing: mutation.isPending,
  };
}
