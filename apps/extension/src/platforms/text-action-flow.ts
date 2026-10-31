import type { TextActionMode } from '@genfeedai/contracts/interfaces';
import { captureComposerText } from '~platforms/composer-helpers';
import { getCurrentPlatform, getPlatformName } from '~platforms/config';
import {
  showTextActionFailure,
  showTextActionPreview,
} from '~platforms/text-action-preview';
import { TextActionSession } from '~platforms/text-action-session';
import type { TextActionRequest, TextActionResponse } from '~types/extension';

export interface TextActionFlowHooks {
  /** Tells the background this text was written by Genfeed, so publishing it may be saved. */
  markWritten: (content: string) => void;
  notify: (message: string, isError?: boolean) => void;
}

export const TEXT_ACTION_PROGRESS: Record<TextActionMode, string> = {
  proofread: 'Proofreading your draft…',
  rewrite: 'Rewriting in your voice…',
};

/**
 * Edits the draft the user is writing on the page: capture it, ask the
 * background for the edit, then show a preview. The composer changes only when
 * the user presses Apply; nothing is ever submitted.
 */
export async function runPageTextAction(
  mode: TextActionMode,
  hooks: TextActionFlowHooks,
): Promise<void> {
  const platform = getCurrentPlatform();
  if (!platform) {
    hooks.notify('Text actions are not available on this page.', true);
    return;
  }
  const captured = captureComposerText(platform);
  if ('error' in captured) {
    hooks.notify(captured.error, true);
    return;
  }
  const { snapshot } = captured;
  const session = new TextActionSession(snapshot);
  const request: TextActionRequest & { event: 'refineText' } = {
    event: 'refineText',
    mode,
    platform: getPlatformName(),
    requestKey: crypto.randomUUID(),
    text: snapshot.text,
  };

  async function attempt(isRetry: boolean): Promise<void> {
    hooks.notify(TEXT_ACTION_PROGRESS[mode]);
    let response: TextActionResponse | undefined;
    try {
      response = await chrome.runtime.sendMessage(
        isRetry ? { ...request, retry: true } : request,
      );
    } catch {
      response = undefined;
    }
    if (!response || 'error' in response) {
      const failure = response && 'error' in response ? response : null;
      const message =
        failure?.error ??
        'Could not reach Genfeed. Reload the page and try again.';
      // A failure with a next step keeps its request key: Retry reruns it.
      if (failure?.recovery) {
        showTextActionFailure({
          message,
          mode,
          onOpenProviderSettings: () => {
            void chrome.runtime.sendMessage({ event: 'openProviderSettings' });
          },
          onRetry: () => {
            void attempt(true);
          },
          recovery: failure.recovery,
        });
      } else {
        hooks.notify(message, true);
      }
      return;
    }
    const { result, routing } = response;
    showTextActionPreview({
      mode,
      onApply: () => {
        const written = session.apply(result.text);
        if ('error' in written) return written;
        hooks.markWritten(written.applied.draftAfter);
        return { success: true };
      },
      onUndo: () => session.undo(),
      original: snapshot.text,
      result,
      routing,
    });
  }

  await attempt(false);
}
