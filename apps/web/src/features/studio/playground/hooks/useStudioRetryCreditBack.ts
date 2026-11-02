'use client';

import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { CreditsService } from '@services/billing/credits.service';
import { logger } from '@services/core/logger.service';
import { useEffect, useRef, useState } from 'react';
import { useDebounce } from '@/hooks/utils/use-debounce/use-debounce';

export const STUDIO_RETRY_CREDIT_BACK_DEBOUNCE_MS = 800;

/** A refresh for the answer already held is skipped inside this window. */
export const STUDIO_RETRY_CREDIT_BACK_MIN_REFRESH_MS = 2_000;

interface RetryCreditBackRecord {
  credits: number;
  key: string;
}

/**
 * Credits a retry of the typed brief would earn back (#7730), read from the
 * server, which holds the user's attempts. Shows nothing until the server has
 * answered for exactly the current prompt, model and quote, so a stale answer
 * never labels a different brief. `credits: null` or an empty prompt skips
 * the request.
 *
 * The answer depends on the user's attempts, not only on what is typed: the
 * prompt stays in the composer after Generate, so the same key now has a new
 * answer. Bumping `refreshToken` (the quote opening) asks the server again.
 */
export function useStudioRetryCreditBack(input: {
  credits: number | null;
  modelKey: string | undefined;
  prompt: string;
  refreshToken?: number;
}): number {
  const getCreditsService = useAuthedService((token: string) =>
    CreditsService.getInstance(token),
  );
  const { orgId, userId } = useAuthIdentity();
  const prompt = useDebounce(
    input.prompt.trim(),
    STUDIO_RETRY_CREDIT_BACK_DEBOUNCE_MS,
  );
  const { credits, modelKey, refreshToken = 0 } = input;
  const keyFor = (text: string): string | null =>
    text && modelKey && credits !== null && credits > 0
      ? JSON.stringify([userId ?? null, orgId ?? null, modelKey, credits, text])
      : null;
  // The request follows the debounced prompt; the answer is shown only while
  // it still matches what is typed now.
  const key = keyFor(prompt);
  const liveKey = keyFor(input.prompt.trim());
  const [record, setRecord] = useState<RetryCreditBackRecord | null>(null);
  const lastAnsweredRef = useRef<{ at: number; key: string } | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshToken only re-runs the request
  useEffect(() => {
    if (!key || !modelKey || credits === null) return;
    const lastAnswered = lastAnsweredRef.current;
    if (
      lastAnswered?.key === key &&
      Date.now() - lastAnswered.at < STUDIO_RETRY_CREDIT_BACK_MIN_REFRESH_MS
    ) {
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const service = await getCreditsService();
        const preview = await service.previewRetryCreditBack(
          { credits, modelKey, prompt },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        lastAnsweredRef.current = { at: Date.now(), key };
        setRecord({ credits: preview.credits, key });
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        logger.error('Studio retry credit-back preview failed', error);
        // A failed refresh keeps the answer already shown for this brief.
        setRecord((held) => (held?.key === key ? held : { credits: 0, key }));
      }
    })();
    return () => controller.abort();
  }, [credits, getCreditsService, key, modelKey, prompt, refreshToken]);

  return liveKey && record?.key === liveKey ? record.credits : 0;
}
