'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { AdminModelPricingRow } from '@genfeedai/contracts/interfaces';
import {
  buildModelFixPrompt,
  modelFixItemsFromPricingRows,
} from '@genfeedai/pricing';
import { NotificationsService } from '@services/core/notifications.service';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { useAdminModelPricingReport } from './use-admin-model-pricing-report';

export interface ModelFixPromptFallback {
  text: string;
  title: string;
}

function adminModelsUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return `${window.location.origin}${APP_ROUTES.ADMIN.AUTOMATION.MODELS}`;
}

/**
 * Copies the shared fix prompt for the models that need pricing attention (all
 * of them, or the rows passed in) and the "audit every price" prompt. When the
 * browser blocks the clipboard the text opens in a dialog to copy by hand.
 */
export function useModelFixPrompt() {
  const t = useTranslations('pages.adminModelPricing');
  const { data: report } = useAdminModelPricingReport();
  const [fallback, setFallback] = useState<ModelFixPromptFallback | null>(null);
  const attentionRows = useMemo(
    () => (report?.rows ?? []).filter((row) => row.attentionLevel !== null),
    [report],
  );

  const copy = useCallback(
    async (text: string, title: string, message: string) => {
      const notifications = NotificationsService.getInstance();
      try {
        await navigator.clipboard.writeText(text);
        notifications.success(message, {
          description: t('promptCopiedHint'),
        });
      } catch {
        notifications.error(t('promptCopyFailed'));
        setFallback({ text, title });
      }
    },
    [t],
  );

  const copyFixPrompt = useCallback(
    (rows: AdminModelPricingRow[] = attentionRows) =>
      copy(
        buildModelFixPrompt({
          adminUrl: adminModelsUrl(),
          items: modelFixItemsFromPricingRows(rows),
          scope: 'attention',
        }),
        t('fixPromptTitle'),
        t('fixPromptCopied', { count: rows.length }),
      ),
    [attentionRows, copy, t],
  );

  const copyAuditPrompt = useCallback(
    () =>
      copy(
        buildModelFixPrompt({
          adminUrl: adminModelsUrl(),
          items: [],
          scope: 'audit-all',
        }),
        t('auditPromptTitle'),
        t('auditPromptCopied'),
      ),
    [copy, t],
  );

  return {
    attentionCount: attentionRows.length,
    closeFallback: () => setFallback(null),
    copyAuditPrompt,
    copyFixPrompt,
    fallback,
  };
}
