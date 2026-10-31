import type {
  TextActionMode,
  TextActionResult,
} from '@genfeedai/contracts/interfaces';
import type {
  ActionRecovery,
  ActionRouting,
} from '@genfeedai/contracts/interfaces/extension/extension-action-routing.interface';
import { useCallback, useReducer, useRef } from 'react';
import { usePlatformStore } from '~store/use-platform-store';
import type { TextActionResponse } from '~types/extension';

export type TextActionPhase = 'idle' | 'working' | 'preview' | 'applied';

/** A request that failed in a way the user can retry: same key, same draft. */
interface FailedTextRequest {
  mode: TextActionMode;
  original: string;
  platform: string;
  requestKey: string;
  snapshotId: string;
}

export interface TextActionState {
  error: string | null;
  failedRequest: FailedTextRequest | null;
  mode: TextActionMode | null;
  original: string;
  phase: TextActionPhase;
  /** What the user can do next after a failure, when there is something to offer. */
  recovery: ActionRecovery | null;
  result: TextActionResult | null;
  /** Present when a local provider wrote the result. */
  routing: ActionRouting | null;
  snapshotId: string | null;
}

export interface UseTextActionReturn extends TextActionState {
  apply: () => Promise<void>;
  dismiss: () => void;
  /** Runs the failed request again with its original key, draft and capture. */
  retry: () => Promise<void>;
  start: (mode: TextActionMode) => Promise<void>;
  undo: () => Promise<void>;
}

type TextActionEvent =
  | { type: 'started'; mode: TextActionMode }
  | {
      type: 'previewed';
      original: string;
      result: TextActionResult;
      routing: ActionRouting | null;
      snapshotId: string;
    }
  | { type: 'applied' }
  | { type: 'undone' }
  | {
      type: 'failed';
      error: string;
      failedRequest?: FailedTextRequest;
      recovery?: ActionRecovery;
    }
  | { type: 'dismissed' };

const INITIAL_STATE: TextActionState = {
  error: null,
  failedRequest: null,
  mode: null,
  original: '',
  phase: 'idle',
  recovery: null,
  result: null,
  routing: null,
  snapshotId: null,
};

function reduce(
  state: TextActionState,
  event: TextActionEvent,
): TextActionState {
  switch (event.type) {
    case 'started':
      return { ...INITIAL_STATE, mode: event.mode, phase: 'working' };
    case 'previewed':
      return {
        ...state,
        error: null,
        failedRequest: null,
        original: event.original,
        phase: 'preview',
        recovery: null,
        result: event.result,
        routing: event.routing,
        snapshotId: event.snapshotId,
      };
    case 'applied':
      return { ...state, error: null, phase: 'applied' };
    case 'undone':
      return { ...state, error: null, phase: 'preview' };
    case 'failed':
      // A failed apply or undo keeps the suggestion; a failed start has none.
      return state.result
        ? { ...state, error: event.error }
        : {
            ...INITIAL_STATE,
            error: event.error,
            failedRequest: event.failedRequest ?? null,
            mode: event.failedRequest?.mode ?? null,
            recovery: event.recovery ?? null,
          };
    case 'dismissed':
      return INITIAL_STATE;
  }
}

interface ContentResponse {
  error?: string;
  scope?: string;
  snapshotId?: string;
  success?: boolean;
  text?: string;
}

async function relayToPage(payload: Record<string, unknown>) {
  const response: ContentResponse | undefined =
    await chrome.runtime.sendMessage({
      event: 'RELAY_TO_CONTENT',
      payload,
    });
  return response;
}

/**
 * Proofread / Rewrite for the side panel. The page captures the composer text
 * and keeps it; the panel previews the suggestion and asks the page to apply
 * or undo it. Nothing is applied until Apply, and nothing is submitted.
 */
export function useTextAction(): UseTextActionReturn {
  const platform = usePlatformStore((s) => s.currentPlatform);
  const [state, dispatch] = useReducer(reduce, INITIAL_STATE);
  const isWorking = useRef(false);

  /** Sends one request to the background and dispatches its outcome. Callers hold the working guard. */
  const submit = useCallback(
    async (request: FailedTextRequest, isRetry: boolean) => {
      const response: TextActionResponse | undefined =
        await chrome.runtime.sendMessage({
          event: 'refineText',
          mode: request.mode,
          platform: request.platform,
          requestKey: request.requestKey,
          ...(isRetry ? { retry: true } : {}),
          text: request.original,
        });
      if (!response || 'error' in response) {
        const failure = response && 'error' in response ? response : null;
        dispatch({
          error: failure?.error ?? 'Could not edit the text.',
          // The same draft and key are kept only when there is a next step to offer.
          failedRequest: failure?.recovery?.canRetry ? request : undefined,
          recovery: failure?.recovery,
          type: 'failed',
        });
        return;
      }
      dispatch({
        original: request.original,
        result: response.result,
        routing: response.routing ?? null,
        snapshotId: request.snapshotId,
        type: 'previewed',
      });
    },
    [],
  );

  const start = useCallback(
    async (mode: TextActionMode) => {
      if (isWorking.current) return;
      if (!platform) {
        dispatch({
          error: 'Open a supported site and its composer first.',
          type: 'failed',
        });
        return;
      }
      isWorking.current = true;
      dispatch({ mode, type: 'started' });
      try {
        const captured = await relayToPage({ type: 'CAPTURE_COMPOSER_TEXT' });
        if (!captured?.success || !captured.snapshotId || !captured.text) {
          throw new Error(
            captured?.error ?? 'Open the composer you want to edit first.',
          );
        }
        await submit(
          {
            mode,
            original: captured.text,
            platform,
            requestKey: crypto.randomUUID(),
            snapshotId: captured.snapshotId,
          },
          false,
        );
      } catch (error) {
        dispatch({
          error:
            error instanceof Error ? error.message : 'Could not edit the text.',
          type: 'failed',
        });
      } finally {
        isWorking.current = false;
      }
    },
    [platform, submit],
  );

  const retry = useCallback(async () => {
    const failedRequest = state.failedRequest;
    if (!failedRequest || isWorking.current) return;
    isWorking.current = true;
    dispatch({ mode: failedRequest.mode, type: 'started' });
    try {
      await submit(failedRequest, true);
    } catch (error) {
      dispatch({
        error:
          error instanceof Error ? error.message : 'Could not edit the text.',
        failedRequest,
        // The same request stays retryable when the extension itself failed to answer.
        recovery: state.recovery ?? undefined,
        type: 'failed',
      });
    } finally {
      isWorking.current = false;
    }
  }, [state.failedRequest, state.recovery, submit]);

  const apply = useCallback(async () => {
    if (!state.result || !state.snapshotId) return;
    const response = await relayToPage({
      snapshotId: state.snapshotId,
      text: state.result.text,
      type: 'APPLY_COMPOSER_TEXT',
    });
    dispatch(
      response?.success
        ? { type: 'applied' }
        : {
            error: response?.error ?? 'Could not apply the text.',
            type: 'failed',
          },
    );
  }, [state.result, state.snapshotId]);

  const undo = useCallback(async () => {
    if (!state.snapshotId) return;
    const response = await relayToPage({
      snapshotId: state.snapshotId,
      type: 'UNDO_COMPOSER_TEXT',
    });
    dispatch(
      response?.success
        ? { type: 'undone' }
        : { error: response?.error ?? 'Could not undo.', type: 'failed' },
    );
  }, [state.snapshotId]);

  const dismiss = useCallback(() => dispatch({ type: 'dismissed' }), []);

  return { ...state, apply, dismiss, retry, start, undo };
}
