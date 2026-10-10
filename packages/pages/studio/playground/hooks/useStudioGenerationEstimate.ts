'use client';

import {
  type AgentGenerationQuote,
  type AgentGenerationQuoteRequest,
  AgentGenerationQuoteUnavailableReason,
} from '@genfeedai/contracts/interfaces';
import type { StudioGenerationCostEstimate } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { RouterService } from '@services/ai/router.service';
import { logger } from '@services/core/logger.service';
import { useEffect, useState } from 'react';

export const STUDIO_ESTIMATE_DEBOUNCE_MS = 400;

interface EstimateRecord {
  fingerprint: string;
  quote: AgentGenerationQuote;
}

/**
 * The Studio credit estimate, read from the server quote that admission
 * charges for the same settings. Nothing is calculated in the browser.
 * Re-requests (debounced, abortable) whenever the model or a priced setting
 * changes; `request: null` means there is nothing concrete to quote.
 */
export function useStudioGenerationEstimate(
  request: AgentGenerationQuoteRequest | null,
): StudioGenerationCostEstimate {
  const getRouterService = useAuthedService((token: string) =>
    RouterService.getInstance(token),
  );
  const { orgId, userId } = useAuthIdentity();
  const [record, setRecord] = useState<EstimateRecord | null>(null);
  // The quote is org-priced, so the scope is part of the identity: switching
  // organization drops the cached answer instead of showing it as current.
  const fingerprint = request
    ? JSON.stringify([userId ?? null, orgId ?? null, request])
    : null;

  useEffect(() => {
    if (!fingerprint) return;
    // The fingerprint is the request, so equal settings never re-request.
    const [, , body]: [unknown, unknown, AgentGenerationQuoteRequest] =
      JSON.parse(fingerprint);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const service = await getRouterService();
          const quote = await service.estimateGenerationCredits(
            body,
            controller.signal,
          );
          if (!controller.signal.aborted) setRecord({ fingerprint, quote });
        } catch (error: unknown) {
          if (controller.signal.aborted) return;
          logger.error('Studio generation estimate failed', error);
          setRecord({
            fingerprint,
            quote: {
              credits: null,
              isAvailable: false,
              modelKey: null,
              unavailableReason: AgentGenerationQuoteUnavailableReason.ERROR,
            },
          });
        }
      })();
    }, STUDIO_ESTIMATE_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [fingerprint, getRouterService]);

  if (!fingerprint || record?.fingerprint !== fingerprint)
    return { credits: null, status: 'loading' };
  const { credits, isAvailable, unavailableReason } = record.quote;
  if (isAvailable && typeof credits === 'number' && Number.isFinite(credits))
    return { credits, status: 'estimated' };
  return { credits: null, status: 'unavailable', unavailableReason };
}
