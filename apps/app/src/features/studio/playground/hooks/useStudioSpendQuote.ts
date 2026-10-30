'use client';

import { hasSourceDerivedAspect } from '@genfeedai/contracts/constants';
import { AgentGenerationQuoteUnavailableReason } from '@genfeedai/contracts/interfaces';
import type { AgentGenerationQuote } from '@genfeedai/contracts/interfaces/ai/agent-generation-quote.interface';
import type { StudioSubmitOptions } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { RouterService } from '@services/ai/router.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StudioSpendQuoteInput } from '@/features/studio/props/studio-playground.props';

type SpendApproval = (options?: StudioSubmitOptions) => void;

export interface UseStudioSpendQuoteReturn {
  /**
   * Prices the generation with the server quote that admission charges, then
   * calls `onSubmit`; a price the server cannot confirm submits nothing. An
   * Auto choice is priced at the model it resolves to, that model is handed to
   * `onSubmit` so the submit does not route a second time, and a toast says
   * which model Auto chose and what it costs.
   */
  quoteSpend: (input: StudioSpendQuoteInput, onSubmit: SpendApproval) => void;
  /** True while the price is being fetched, before the generation submits. */
  isQuoting: boolean;
}

function readReason(
  quote: AgentGenerationQuote,
): AgentGenerationQuoteUnavailableReason {
  return quote.unavailableReason ?? AgentGenerationQuoteUnavailableReason.ERROR;
}

export function useStudioSpendQuote(): UseStudioSpendQuoteReturn {
  const translate = useTranslations('pages.studioPlayground.spend');
  const translateReason = useTranslations(
    'pages.studioPlayground.summary.estimateReasons',
  );
  const getRouterService = useAuthedService((token: string) =>
    RouterService.getInstance(token),
  );
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const [isQuoting, setIsQuoting] = useState(false);
  const isQuotingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  // Names the model the price is missing for, so the user can pick another.
  const reportUnavailable = useCallback(
    (
      reason: AgentGenerationQuoteUnavailableReason,
      model?: { key?: string | null; models: StudioSpendQuoteInput['models'] },
    ) => {
      const modelKey = model?.key;
      const modelLabel = modelKey
        ? (model.models.find((candidate) => candidate.key === modelKey)
            ?.label ?? modelKey)
        : undefined;
      notificationsService.error(
        modelLabel
          ? translate('unavailableForModel', {
              model: modelLabel,
              reason: translateReason(reason),
            })
          : translate('unavailable', { reason: translateReason(reason) }),
      );
    },
    [notificationsService, translate, translateReason],
  );

  // The Generate button already shows the price of a chosen model; only the
  // source-sized note and the model Auto picked need saying.
  const announce = useCallback(
    (details: { credits?: number; modelKey?: string; modelLabel?: string }) => {
      if (details.modelLabel && details.credits !== undefined) {
        notificationsService.info(
          translate('autoChose', {
            credits: details.credits,
            model: details.modelLabel,
          }),
        );
      }
      if (details.modelKey && hasSourceDerivedAspect(details.modelKey)) {
        notificationsService.info(translate('sourceAspectNote'));
      }
    },
    [notificationsService, translate],
  );

  const quoteSpend = useCallback(
    (input: StudioSpendQuoteInput, onSubmit: SpendApproval) => {
      const { modelKey, models, source } = input;
      if (isQuotingRef.current) return;
      if (source.kind === 'unpriced' || source.kind === 'known') {
        if (source.kind === 'known' && !source.isByok && source.credits > 0) {
          announce({ modelKey });
        }
        onSubmit();
        return;
      }

      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      isQuotingRef.current = true;
      setIsQuoting(true);
      void (async () => {
        try {
          const service = await getRouterService();
          let pinnedModelKey: string | undefined;
          if (source.autoRequest) {
            const routed = await service.estimateGenerationCredits(
              source.autoRequest,
              controller.signal,
            );
            if (
              !routed.isAvailable ||
              !routed.modelKey ||
              !models.some((model) => model.key === routed.modelKey)
            ) {
              reportUnavailable(
                routed.isAvailable
                  ? AgentGenerationQuoteUnavailableReason.MODEL_UNAVAILABLE
                  : readReason(routed),
                { key: routed.modelKey, models },
              );
              return;
            }
            pinnedModelKey = routed.modelKey;
          }
          const request = source.buildRequest(pinnedModelKey);
          if (!request) {
            reportUnavailable(
              AgentGenerationQuoteUnavailableReason.INSUFFICIENT_INPUT,
            );
            return;
          }
          const quote = await service.estimateGenerationCredits(
            request,
            controller.signal,
          );
          if (controller.signal.aborted) return;
          if (
            !quote.isAvailable ||
            typeof quote.credits !== 'number' ||
            !Number.isFinite(quote.credits)
          ) {
            reportUnavailable(readReason(quote), {
              key: quote.modelKey ?? pinnedModelKey ?? modelKey,
              models,
            });
            return;
          }
          if (quote.credits > 0) {
            announce({
              credits: quote.credits,
              modelKey: pinnedModelKey ?? modelKey,
              modelLabel: pinnedModelKey
                ? (models.find((model) => model.key === pinnedModelKey)
                    ?.label ?? pinnedModelKey)
                : undefined,
            });
          }
          onSubmit(pinnedModelKey ? { pinnedModelKey } : undefined);
        } catch (error: unknown) {
          if (controller.signal.aborted) return;
          logger.error('Studio generation price check failed', error);
          reportUnavailable(AgentGenerationQuoteUnavailableReason.ERROR);
        } finally {
          if (controllerRef.current === controller) {
            isQuotingRef.current = false;
            setIsQuoting(false);
          }
        }
      })();
    },
    [announce, getRouterService, reportUnavailable],
  );

  return { isQuoting, quoteSpend };
}
