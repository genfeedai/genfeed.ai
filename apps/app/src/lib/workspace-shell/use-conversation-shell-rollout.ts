'use client';

import { isBetterAuthEnabled } from '@genfeedai/auth-client';
import {
  type ConversationShellEvaluation,
  isConversationShellEvaluation,
} from '@genfeedai/config/conversation-shell-rollout';
import {
  isDesktopClient,
  isSelfHostedDeployment,
} from '@genfeedai/config/deployment';
import { ConversationShellFeatureFlagService } from '@genfeedai/services/feature-flags/conversation-shell.service';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { logger } from '@services/core/logger.service';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOptionalAuth } from '@/hooks/useOptionalAuth';
import {
  clearWorkspaceShellEvaluationCircuit,
  isWorkspaceShellCircuitOpen,
  openWorkspaceShellCircuit,
} from './use-conversation-shell';
import {
  captureWorkspaceShellError,
  captureWorkspaceShellFallback,
  captureWorkspaceShellSession,
  setWorkspaceShellTelemetryContext,
} from './workspace-shell-telemetry';

const ROLLBACK_POLL_INTERVAL_MS = 60_000;

interface ConversationShellRolloutState {
  readonly evaluation: ConversationShellEvaluation | null;
  readonly isReady: boolean;
}

export function useConversationShellRollout(): ConversationShellRolloutState {
  const { getToken, isLoaded, isSignedIn, orgId, sessionId, userId } =
    useOptionalAuth();
  const isLocalUnauthenticated =
    isSelfHostedDeployment() && !isBetterAuthEnabled();
  const canEvaluate = isLocalUnauthenticated || (isLoaded && isSignedIn);
  const client = isDesktopClient() ? 'desktop' : 'web';
  const identityKey = [sessionId, userId, orgId, client]
    .map((value) => value ?? 'none')
    .join(':');
  const [state, setState] = useState<ConversationShellRolloutState>({
    evaluation: null,
    isReady: false,
  });
  const sessionEventKeyRef = useRef<string | null>(null);

  const evaluate = useCallback(
    async (signal: AbortSignal): Promise<ConversationShellEvaluation> => {
      const token = await resolveAuthToken(getToken);
      if (!token && !isLocalUnauthenticated) {
        throw new Error(
          'Conversation shell evaluation requires authentication',
        );
      }

      const evaluation = await ConversationShellFeatureFlagService.getInstance(
        token ?? '',
      ).evaluate(client, signal);
      if (!isConversationShellEvaluation(evaluation)) {
        throw new Error(
          'Conversation shell evaluation returned an invalid contract',
        );
      }

      return evaluation;
    },
    [client, getToken, isLocalUnauthenticated],
  );

  useEffect(() => {
    sessionEventKeyRef.current = `pending:${identityKey}`;
    setWorkspaceShellTelemetryContext(null);

    if (!canEvaluate) {
      setState({ evaluation: null, isReady: isLoaded });
      return undefined;
    }

    const abortController = new AbortController();
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    const failClosed = (
      reason: 'evaluation_error' | 'server_rollback',
      evaluation: ConversationShellEvaluation | null = null,
    ): void => {
      openWorkspaceShellCircuit('evaluation');
      captureWorkspaceShellFallback(reason);
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
      setState({ evaluation, isReady: true });
    };

    const pollForRollback = async (): Promise<void> => {
      try {
        const evaluation = await evaluate(abortController.signal);
        if (abortController.signal.aborted) {
          return;
        }

        if (!evaluation.isEnabled) {
          setWorkspaceShellTelemetryContext(evaluation);
          failClosed('server_rollback', evaluation);
        }
      } catch (error: unknown) {
        if (abortController.signal.aborted) {
          return;
        }
        captureWorkspaceShellError('evaluation', 'request_failed');
        logger.error('Conversation shell rollback evaluation failed', {
          error,
          reportToSentry: true,
        });
        failClosed('evaluation_error');
      }
    };

    void evaluate(abortController.signal)
      .then((evaluation) => {
        if (abortController.signal.aborted) {
          return;
        }

        setWorkspaceShellTelemetryContext(evaluation);
        if (evaluation.isEnabled) {
          clearWorkspaceShellEvaluationCircuit();
        }
        if (evaluation.isEnabled && isWorkspaceShellCircuitOpen()) {
          setState({ evaluation: null, isReady: true });
          return;
        }
        setState({ evaluation, isReady: true });

        if (evaluation.isEnabled) {
          const eventKey = [
            evaluation.configVersion,
            evaluation.rollbackRevision,
            evaluation.cohort,
            evaluation.deploymentMode,
          ].join(':');
          if (sessionEventKeyRef.current !== eventKey) {
            sessionEventKeyRef.current = eventKey;
            captureWorkspaceShellSession();
          }
          pollTimer = setInterval(
            () => void pollForRollback(),
            ROLLBACK_POLL_INTERVAL_MS,
          );
        }
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          return;
        }
        captureWorkspaceShellError('evaluation', 'request_failed');
        logger.error('Conversation shell initial evaluation failed', {
          error,
          reportToSentry: true,
        });
        failClosed('evaluation_error');
      });

    return () => {
      abortController.abort();
      if (pollTimer) {
        clearInterval(pollTimer);
      }
    };
  }, [canEvaluate, evaluate, identityKey, isLoaded]);

  return useMemo(() => state, [state]);
}
