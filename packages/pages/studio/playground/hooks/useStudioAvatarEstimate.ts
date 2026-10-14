'use client';

import {
  AgentGenerationQuoteUnavailableReason,
  type AvatarGenerationQuote,
  type HeyGenAvatarVideoRequest,
} from '@genfeedai/contracts/interfaces';
import type { StudioGenerationCostEstimate } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { STUDIO_ESTIMATE_DEBOUNCE_MS } from '@pages/studio/playground/hooks/useStudioGenerationEstimate';
import { logger } from '@services/core/logger.service';
import { HeyGenService } from '@services/ingredients/heygen.service';
import { useEffect, useState } from 'react';

interface AvatarEstimateRecord {
  fingerprint: string;
  quote: AvatarGenerationQuote | null;
}

/**
 * The Studio avatar estimate, read from `POST /videos/avatar/quote` for the
 * body Generate would submit, so it is the price admission holds. Debounced
 * and abortable like the other Studio estimates; `request: null` means the
 * script, avatar or voice is still missing, so there is nothing to quote.
 */
export function useStudioAvatarEstimate(
  request: HeyGenAvatarVideoRequest | null,
): StudioGenerationCostEstimate {
  const getHeyGenService = useAuthedService((token: string) =>
    HeyGenService.getInstance(token),
  );
  const { orgId, userId } = useAuthIdentity();
  const [record, setRecord] = useState<AvatarEstimateRecord | null>(null);
  // The quote is org-funded (BYOK or platform), so the scope is part of it.
  const fingerprint = request
    ? JSON.stringify([userId ?? null, orgId ?? null, request])
    : null;

  useEffect(() => {
    if (!fingerprint) return;
    const [, , body]: [unknown, unknown, HeyGenAvatarVideoRequest] =
      JSON.parse(fingerprint);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const service = await getHeyGenService();
          const quote = await service.quote(body, controller.signal);
          if (!controller.signal.aborted) setRecord({ fingerprint, quote });
        } catch (error: unknown) {
          if (controller.signal.aborted) return;
          logger.error('Studio avatar estimate failed', error);
          setRecord({ fingerprint, quote: null });
        }
      })();
    }, STUDIO_ESTIMATE_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [fingerprint, getHeyGenService]);

  if (!fingerprint)
    return {
      credits: null,
      status: 'unavailable',
      unavailableReason:
        AgentGenerationQuoteUnavailableReason.INSUFFICIENT_INPUT,
    };
  if (record?.fingerprint !== fingerprint)
    return { credits: null, status: 'loading' };
  if (!record.quote)
    return {
      credits: null,
      status: 'unavailable',
      unavailableReason: AgentGenerationQuoteUnavailableReason.ERROR,
    };
  const { billingMode, credits, estimatedSeconds } = record.quote;
  return {
    billingMode,
    credits,
    ...(estimatedSeconds !== null ? { estimatedSeconds } : {}),
    status: 'estimated',
  };
}
