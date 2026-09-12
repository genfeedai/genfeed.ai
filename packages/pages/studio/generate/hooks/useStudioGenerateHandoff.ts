'use client';

import type { AgentStudioHandoffPayload } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { parseStudioHandoffId } from '@pages/studio/generate/utils/studio-handoff-url';
import { AgentStudioHandoffService } from '@services/content/agent-studio-handoff.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

export interface UseStudioGenerateHandoffResult {
  /** `true` only while a handoff id from the URL is being consumed. */
  readonly isLoading: boolean;
  /**
   * The consumed handoff, or `null` when there was no `handoff` query param,
   * or the handoff was missing, expired, already used, or belonged to
   * someone else. Every one of those falls back to Studio's usual defaults
   * with a notice, never a blocked page.
   */
  readonly payload: AgentStudioHandoffPayload | null;
}

/**
 * #4670 Open in Studio, Studio side: reads the `handoff` query param once,
 * consumes it (single-use — the server deletes it on this call), and hands
 * the resolved payload back for `StudioGenerateWorkspace` to apply.
 *
 * Uses `AgentStudioHandoffService` (a plain `HTTPBaseService`, resolved
 * through `useAuthedService`) rather than `@genfeedai/agent`'s
 * `useAgentApiService()` — that provider is only mounted on the dedicated
 * `/agent` route, never on Studio, so depending on it here would leave
 * `isLoading` stuck forever on every real Studio page load.
 */
export function useStudioGenerateHandoff(): UseStudioGenerateHandoffResult {
  const getHandoffService = useAuthedService((token: string) =>
    AgentStudioHandoffService.getInstance(token),
  );
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
    if (consumedIdRef.current === handoffId) {
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    void (async () => {
      try {
        const service = await getHandoffService();
        const result = await service.consume(handoffId, controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        // Only latch the guard once the server has given a definitive
        // answer — a StrictMode double-effect or a dependency-identity
        // change that aborts this call mid-flight must not permanently
        // block a real retry (the abort likely means the request never
        // reached the server, so the record is probably still there).
        consumedIdRef.current = handoffId;
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
  }, [getHandoffService, handoffId, notificationsService]);

  return { isLoading, payload };
}
