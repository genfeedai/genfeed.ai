'use client';

import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useDebounce } from '@hooks/utils/use-debounce/use-debounce';
import { CreditsService } from '@services/billing/credits.service';
import { logger } from '@services/core/logger.service';
import { useEffect, useState } from 'react';

export const STUDIO_RETRY_CREDIT_BACK_DEBOUNCE_MS = 800;

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
 */
export function useStudioRetryCreditBack(input: {
  credits: number | null;
  modelKey: string | undefined;
  prompt: string;
}): number {
  const getCreditsService = useAuthedService((token: string) =>
    CreditsService.getInstance(token),
  );
  const { orgId, userId } = useAuthIdentity();
  const prompt = useDebounce(
    input.prompt.trim(),
    STUDIO_RETRY_CREDIT_BACK_DEBOUNCE_MS,
  );
  const { credits, modelKey } = input;
  const keyFor = (text: string): string | null =>
    text && modelKey && credits !== null && credits > 0
      ? JSON.stringify([userId ?? null, orgId ?? null, modelKey, credits, text])
      : null;
  // The request follows the debounced prompt; the answer is shown only while
  // it still matches what is typed now.
  const key = keyFor(prompt);
  const liveKey = keyFor(input.prompt.trim());
  const [record, setRecord] = useState<RetryCreditBackRecord | null>(null);

  useEffect(() => {
    if (!key || !modelKey || credits === null) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const service = await getCreditsService();
        const preview = await service.previewRetryCreditBack(
          { credits, modelKey, prompt },
          controller.signal,
        );
        if (!controller.signal.aborted)
          setRecord({ credits: preview.credits, key });
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        logger.error('Studio retry credit-back preview failed', error);
        setRecord({ credits: 0, key });
      }
    })();
    return () => controller.abort();
  }, [credits, getCreditsService, key, modelKey, prompt]);

  return liveKey && record?.key === liveKey ? record.credits : 0;
}
