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
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { useEffect, useRef, useState } from 'react';

export const STUDIO_ESTIMATE_DEBOUNCE_MS = 400;

interface EstimateRecord {
  fingerprint: string;
  ownerEpoch: number;
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
  const { orgId, userId, sessionId } = useAuthIdentity();
  const [record, setRecord] = useState<EstimateRecord | null>(null);
  // The quote is org-priced, so the scope is part of the identity: switching
  // organization drops the cached answer instead of showing it as current.
  const fingerprint = request
    ? JSON.stringify([
        userId ?? null,
        orgId ?? null,
        sessionId ?? null,
        EnvironmentService.apiEndpoint,
        request,
      ])
    : null;
  const ownerRef = useRef({ fingerprint, epoch: 0 });
  if (ownerRef.current.fingerprint !== fingerprint)
    ownerRef.current = { fingerprint, epoch: ownerRef.current.epoch + 1 };
  const owner = ownerRef.current;

  useEffect(() => {
    if (!fingerprint) return;
    // The fingerprint is the request, so equal settings never re-request.
    const [, , , , body]: [
      unknown,
      unknown,
      unknown,
      unknown,
      AgentGenerationQuoteRequest,
    ] = JSON.parse(fingerprint);
    const controller = new AbortController();
    const canApply = () =>
      !controller.signal.aborted && ownerRef.current === owner;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          if (!canApply()) return;
          const service = await getRouterService();
          if (!canApply()) return;
          const quote = await service.estimateGenerationCredits(
            body,
            controller.signal,
          );
          if (canApply())
            setRecord({ fingerprint, ownerEpoch: owner.epoch, quote });
        } catch (error: unknown) {
          if (!canApply()) return;
          logger.error('Studio generation estimate failed', error);
          setRecord({
            fingerprint,
            ownerEpoch: owner.epoch,
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
  }, [fingerprint, getRouterService, owner]);

  if (
    !fingerprint ||
    record?.fingerprint !== fingerprint ||
    record.ownerEpoch !== owner.epoch
  )
    return { credits: null, status: 'loading' };
  const { credits, isAvailable, unavailableReason } = record.quote;
  if (isAvailable && typeof credits === 'number' && Number.isFinite(credits))
    return { credits, status: 'estimated' };
  return { credits: null, status: 'unavailable', unavailableReason };
}
