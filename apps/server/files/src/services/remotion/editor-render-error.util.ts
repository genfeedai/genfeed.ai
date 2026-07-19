import {
  EditorRenderCancelledError,
  EditorRenderTimeoutError,
} from '@files/services/remotion/remotion-renderer.service';
import {
  EDITOR_RENDER_PUBLIC_MESSAGES,
  type EditorRenderTerminalReason,
} from '@genfeedai/interfaces';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';

export interface ClassifiedEditorRenderError {
  publicMessage: string;
  reason: EditorRenderTerminalReason;
}

export function classifyEditorRenderError(
  error: unknown,
): ClassifiedEditorRenderError {
  if (error instanceof EditorRenderCancelledError) {
    return {
      publicMessage: EDITOR_RENDER_PUBLIC_MESSAGES.cancelled,
      reason: 'cancelled',
    };
  }
  if (error instanceof EditorRenderTimeoutError) {
    return {
      publicMessage: EDITOR_RENDER_PUBLIC_MESSAGES.timed_out,
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
      publicMessage: EDITOR_RENDER_PUBLIC_MESSAGES.asset_unavailable,
      reason: 'asset_unavailable',
    };
  }

  return {
    publicMessage: EDITOR_RENDER_PUBLIC_MESSAGES.renderer_failed,
    reason: 'renderer_failed',
  };
}
