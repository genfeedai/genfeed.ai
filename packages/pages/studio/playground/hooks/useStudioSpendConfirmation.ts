'use client';

import { useConfirmModal } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { formatCreditBalanceExact } from '@genfeedai/contracts/constants';
import { AgentGenerationQuoteUnavailableReason } from '@genfeedai/contracts/interfaces';
import type { AgentGenerationQuote } from '@genfeedai/contracts/interfaces/ai/agent-generation-quote.interface';
import type { StudioSubmitOptions } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { useTopbarBalances } from '@genfeedai/hooks/data/billing/use-topbar-balances/use-topbar-balances';
import type { StudioSpendConfirmationInput } from '@genfeedai/props/studio/studio-playground.props';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { RouterService } from '@services/ai/router.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SpendApproval = (options?: StudioSubmitOptions) => void;

export interface UseStudioSpendConfirmationReturn {
  /**
   * Prices the generation with the server quote that admission charges, asks
   * the operator to confirm that amount, and only then calls `onApproved`.
   * An Auto choice is priced at the model it resolves to, and that model is
   * handed to `onApproved` so the submit does not route a second time.
   */
  confirmSpend: (
    input: StudioSpendConfirmationInput,
    onApproved: SpendApproval,
  ) => void;
  /** True while the price is being fetched, before the dialog opens. */
  isQuoting: boolean;
}

function readReason(
  quote: AgentGenerationQuote,
): AgentGenerationQuoteUnavailableReason {
  return quote.unavailableReason ?? AgentGenerationQuoteUnavailableReason.ERROR;
}

export function useStudioSpendConfirmation(): UseStudioSpendConfirmationReturn {
  const translate = useTranslations('pages.studioPlayground.spend');
  const translateReason = useTranslations(
    'pages.studioPlayground.summary.estimateReasons',
  );
  const { openConfirm } = useConfirmModal();
  const { genfeedBalance } = useTopbarBalances();
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
  const balanceRef = useRef(genfeedBalance);
  balanceRef.current = genfeedBalance;

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  const reportUnavailable = useCallback(
    (reason: AgentGenerationQuoteUnavailableReason) => {
      notificationsService.error(
        translate('unavailable', { reason: translateReason(reason) }),
      );
    },
    [notificationsService, translate, translateReason],
  );

  const openDialog = useCallback(
    (details: {
      credits: number;
      isStillCurrent?: () => boolean;
      modelLabel?: string;
      onApproved: () => void;
    }) => {
      const balance = balanceRef.current;
      const hasBalance =
        typeof balance === 'number' && Number.isFinite(balance);
      const formattedBalance = hasBalance
        ? formatCreditBalanceExact(balance)
        : '';
      const values = {
        balance: formattedBalance,
        credits: details.credits,
        model: details.modelLabel ?? '',
      };
      const messageKey = details.modelLabel
        ? hasBalance
          ? 'messageAutoWithBalance'
          : 'messageAuto'
        : hasBalance
          ? 'messageWithBalance'
          : 'message';
      openConfirm({
        confirmLabel: translate('confirm', values),
        isOpen: true,
        label: translate('title', values),
        message: translate(messageKey, values),
        onConfirm: () => {
          if (details.isStillCurrent && !details.isStillCurrent()) {
            notificationsService.error(translate('priceChanged'));
            return;
          }
          details.onApproved();
        },
      });
    },
    [notificationsService, openConfirm, translate],
  );

  const confirmSpend = useCallback(
    (input: StudioSpendConfirmationInput, onApproved: SpendApproval) => {
      const { models, source } = input;
      if (isQuotingRef.current) return;
      if (source.kind === 'unpriced') {
        onApproved();
        return;
      }
      if (source.kind === 'known') {
        if (source.isByok || source.credits <= 0) {
          onApproved();
          return;
        }
        openDialog({
          credits: source.credits,
          isStillCurrent: source.isStillCurrent,
          onApproved: () => onApproved(),
        });
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
            reportUnavailable(readReason(quote));
            return;
          }
          const approved = () =>
            onApproved(pinnedModelKey ? { pinnedModelKey } : undefined);
          if (quote.credits <= 0) {
            approved();
            return;
          }
          openDialog({
            credits: quote.credits,
            modelLabel: pinnedModelKey
              ? (models.find((model) => model.key === pinnedModelKey)?.label ??
                pinnedModelKey)
              : undefined,
            onApproved: approved,
          });
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
    [getRouterService, openDialog, reportUnavailable],
  );

  return { confirmSpend, isQuoting };
}
