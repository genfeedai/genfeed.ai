import type {
  TextActionMode,
  TextActionResult,
} from '@genfeedai/contracts/interfaces';
import { useCallback, useReducer, useRef } from 'react';
import { usePlatformStore } from '~store/use-platform-store';
import type { TextActionResponse } from '~types/extension';

export type TextActionPhase = 'idle' | 'working' | 'preview' | 'applied';

export interface TextActionState {
  error: string | null;
  mode: TextActionMode | null;
  original: string;
  phase: TextActionPhase;
  result: TextActionResult | null;
  snapshotId: string | null;
}

export interface UseTextActionReturn extends TextActionState {
  apply: () => Promise<void>;
  dismiss: () => void;
  start: (mode: TextActionMode) => Promise<void>;
  undo: () => Promise<void>;
}

type TextActionEvent =
  | { type: 'started'; mode: TextActionMode }
  | {
      type: 'previewed';
      original: string;
      result: TextActionResult;
      snapshotId: string;
    }
  | { type: 'applied' }
  | { type: 'undone' }
  | { type: 'failed'; error: string }
  | { type: 'dismissed' };

const INITIAL_STATE: TextActionState = {
  error: null,
  mode: null,
  original: '',
  phase: 'idle',
  result: null,
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
        original: event.original,
        phase: 'preview',
        result: event.result,
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
        : { ...INITIAL_STATE, error: event.error };
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
        const response: TextActionResponse | undefined =
          await chrome.runtime.sendMessage({
            event: 'refineText',
            mode,
            platform,
            requestKey: crypto.randomUUID(),
            text: captured.text,
          });
        if (!response || 'error' in response) {
          throw new Error(response?.error ?? 'Could not edit the text.');
        }
        dispatch({
          original: captured.text,
          result: response.result,
          snapshotId: captured.snapshotId,
          type: 'previewed',
        });
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
    [platform],
  );

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

  return { ...state, apply, dismiss, start, undo };
}
