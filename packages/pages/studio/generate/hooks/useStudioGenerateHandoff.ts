'use client';

import { useAgentApiService } from '@genfeedai/agent';
import type { AgentStudioHandoffPayload } from '@genfeedai/contracts/interfaces';
import { parseStudioHandoffId } from '@pages/studio/generate/utils/studio-handoff-url';
import { NotificationsService } from '@services/core/notifications.service';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

export interface UseStudioGenerateHandoffResult {
  /** `true` only while a handoff id from the URL is being consumed. */
  readonly isLoading: boolean;
  /**
   * The consumed handoff, or `null` when there was no `handoff` query param,
   * the service is unavailable, or the handoff was missing, expired,
   * already used, or belonged to someone else — every one of those falls
   * back to Studio's usual defaults with a notice, never a blocked page.
   */
  readonly payload: AgentStudioHandoffPayload | null;
}

/**
 * #4670 Open in Studio, Studio side: reads the `handoff` query param once,
 * consumes it (single-use — the server deletes it on this call), and hands
 * the resolved payload back for `StudioGenerateWorkspace` to apply. Never
 * throws — a failed consume degrades to `payload: null` plus a toast.
 */
export function useStudioGenerateHandoff(): UseStudioGenerateHandoffResult {
  const agentApiService = useAgentApiService();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const handoffId = useMemo(
    () => parseStudioHandoffId(new URLSearchParams(searchParamsString)),
    [searchParamsString],
  );
  const [payload, setPayload] = useState<AgentStudioHandoffPayload | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(Boolean(handoffId));
  const consumedIdRef = useRef<string | null>(null);
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  useEffect(() => {
    if (!handoffId) {
      setIsLoading(false);
      return;
    }
    if (!agentApiService) {
      // The provider hasn't mounted the Agent API client yet; wait for it
      // rather than giving up on the very first render.
      return;
    }
    if (consumedIdRef.current === handoffId) {
      return;
    }
    consumedIdRef.current = handoffId;

    const controller = new AbortController();
    setIsLoading(true);
    void (async () => {
      try {
        const result = await agentApiService.consumeStudioHandoff(
          handoffId,
          controller.signal,
        );
        if (controller.signal.aborted) {
          return;
        }
        if (!result) {
          notificationsService.info(
            'That Studio handoff has expired or was already used. Continuing with your usual defaults.',
          );
        }
        setPayload(result);
      } catch {
        if (controller.signal.aborted) {
          return;
        }
        notificationsService.info(
          'Could not load the Studio handoff. Continuing with your usual defaults.',
        );
        setPayload(null);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [agentApiService, handoffId, notificationsService]);

  return { isLoading, payload };
}
