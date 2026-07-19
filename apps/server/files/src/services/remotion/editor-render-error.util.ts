import {
  EditorRenderCancelledError,
  EditorRenderTimeoutError,
} from '@files/services/remotion/remotion-renderer.service';
import type { EditorRenderTerminalReason } from '@genfeedai/interfaces';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';

export interface ClassifiedEditorRenderError {
  publicMessage: string;
  reason: EditorRenderTerminalReason;
}

const PUBLIC_MESSAGES: Record<EditorRenderTerminalReason, string> = {
  asset_unavailable: 'A required render asset could not be loaded.',
  cancelled: 'The render was cancelled.',
  renderer_failed: 'The renderer could not complete this project.',
  timed_out: 'The render exceeded its time limit.',
  worker_lost: 'The render worker stopped before completion.',
};

export function classifyEditorRenderError(
  error: unknown,
): ClassifiedEditorRenderError {
  if (error instanceof EditorRenderCancelledError) {
    return {
      publicMessage: PUBLIC_MESSAGES.cancelled,
      reason: 'cancelled',
    };
  }
  if (error instanceof EditorRenderTimeoutError) {
    return {
      publicMessage: PUBLIC_MESSAGES.timed_out,
      reason: 'timed_out',
    };
  }

  const message = getErrorMessage(error);
  if (
    /download|fetch|http status|media|asset|net::|network|status code/i.test(
      message,
    )
  ) {
    return {
      publicMessage: PUBLIC_MESSAGES.asset_unavailable,
      reason: 'asset_unavailable',
    };
  }

  return {
    publicMessage: PUBLIC_MESSAGES.renderer_failed,
    reason: 'renderer_failed',
  };
}
