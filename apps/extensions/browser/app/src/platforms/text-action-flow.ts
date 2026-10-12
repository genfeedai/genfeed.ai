import type { TextActionMode } from '@genfeedai/contracts/interfaces';
import { captureComposerText } from '~platforms/composer-helpers';
import { getCurrentPlatform, getPlatformName } from '~platforms/config';
import { showTextActionPreview } from '~platforms/text-action-preview';
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
  if (!captured.success) {
    hooks.notify(captured.error, true);
    return;
  }
  const session = new TextActionSession(captured.snapshot);
  const request: TextActionRequest & { event: 'refineText' } = {
    event: 'refineText',
    mode,
    platform: getPlatformName(),
    requestKey: crypto.randomUUID(),
    text: captured.snapshot.text,
  };
  hooks.notify(TEXT_ACTION_PROGRESS[mode]);
  let response: TextActionResponse | undefined;
  try {
    response = await chrome.runtime.sendMessage(request);
  } catch {
    response = undefined;
  }
  if (!response?.success) {
    hooks.notify(
      response?.error ??
        'Could not reach Genfeed. Reload the page and try again.',
      true,
    );
    return;
  }
  const { result } = response;
  showTextActionPreview({
    mode,
    onApply: () => {
      const written = session.apply(result.text);
      if (!written.success) return written;
      hooks.markWritten(written.applied.draftAfter);
      return { success: true };
    },
    onUndo: () => session.undo(),
    original: captured.snapshot.text,
    result,
  });
}
