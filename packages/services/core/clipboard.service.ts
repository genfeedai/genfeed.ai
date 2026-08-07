import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';

function canUseClipboardApi(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard?.writeText === 'function'
  );
}

/**
 * Fallback for environments where the Clipboard API is blocked (permissions,
 * non-secure context). Uses a temporary textarea + execCommand.
 */
function writeTextViaExecCommand(text: string): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.append(textarea);
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  let didCopy = false;
  try {
    didCopy = document.execCommand('copy');
  } catch {
    didCopy = false;
  }

  textarea.remove();
  return didCopy;
}

export class ClipboardService {
  private static classInstance?: ClipboardService;
  private isCopying = false;

  private notificationsService = NotificationsService.getInstance();

  private constructor() {}

  public static getInstance(): ClipboardService {
    if (!ClipboardService.classInstance) {
      ClipboardService.classInstance = new ClipboardService();
    }

    return ClipboardService.classInstance;
  }

  public async copyToClipboard(text?: string): Promise<void> {
    this.isCopying = true;
    const payload = text ?? '';

    try {
      // Always write in the browser — including local/dev. Gating on production
      // made "Copied to clipboard" toast while the clipboard stayed empty.
      if (canUseClipboardApi()) {
        await navigator.clipboard.writeText(payload);
      } else if (!writeTextViaExecCommand(payload)) {
        throw new Error('Clipboard write is unavailable in this environment');
      }
      this.notificationsService.success('Copied to clipboard');
    } catch (error) {
      // Prefer silent fallback before surfacing failure.
      if (writeTextViaExecCommand(payload)) {
        this.notificationsService.success('Copied to clipboard');
      } else {
        logger.error('Copy to clipboard failed', error);
        this.notificationsService.error('Copy to clipboard failed');
      }
    } finally {
      this.isCopying = false;
    }
  }

  public async copyRichTextToClipboard({
    html,
    text,
  }: {
    html: string;
    text: string;
  }): Promise<void> {
    this.isCopying = true;

    try {
      const canWriteRichText =
        canUseClipboardApi() &&
        'ClipboardItem' in window &&
        typeof navigator.clipboard?.write === 'function';

      if (canWriteRichText) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
          }),
        ]);
      } else if (canUseClipboardApi()) {
        await navigator.clipboard.writeText(text);
      } else if (!writeTextViaExecCommand(text)) {
        throw new Error('Clipboard write is unavailable in this environment');
      }
      this.notificationsService.success('Copied to clipboard');
    } catch (error) {
      if (writeTextViaExecCommand(text)) {
        this.notificationsService.success('Copied to clipboard');
      } else {
        logger.error('Copy rich text to clipboard failed', error);
        this.notificationsService.error('Copy to clipboard failed');
      }
    } finally {
      this.isCopying = false;
    }
  }

  public get isCopyingToClipboard() {
    return this.isCopying;
  }
}
