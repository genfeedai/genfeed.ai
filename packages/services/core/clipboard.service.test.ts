import { ClipboardService } from '@services/core/clipboard.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// `ClipboardService` captures `NotificationsService.getInstance()` in a field
// initialiser, so the mock has to hand back the *same* object every call —
// the bare automock returns `undefined` and the service ends up with no
// notifier at all.
vi.mock('@services/core/notifications.service', () => {
  const instance = { error: vi.fn(), success: vi.fn() };

  return { NotificationsService: { getInstance: vi.fn(() => instance) } };
});

const execCommand = vi.fn(() => false);

/**
 * This package runs its suite under `environment: 'node'`
 * (`packages/services/vitest.config.ts`), so `window`, `navigator`, and
 * `document` — all three of which `ClipboardService` branches on — do not
 * exist. Stub them per test the way the rest of the package does
 * (`agent-overlay-coordination.service.spec.ts`, `logger.service.test.ts`,
 * `billing/managed-credits.service.test.ts`) rather than pulling jsdom into a
 * node-only workspace for one file.
 */
function stubBrowserGlobals(writeText: (text: string) => Promise<void>): void {
  vi.stubGlobal('window', {});
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  vi.stubGlobal('document', {
    body: { append: vi.fn() },
    createElement: vi.fn(() => ({
      remove: vi.fn(),
      select: vi.fn(),
      setAttribute: vi.fn(),
      setSelectionRange: vi.fn(),
      style: {},
      value: '',
    })),
    execCommand,
  });
}

describe('ClipboardService', () => {
  let clipboardService: ClipboardService;
  let notificationsService: NotificationsService;

  beforeEach(() => {
    vi.clearAllMocks();
    clipboardService = ClipboardService.getInstance();
    notificationsService = NotificationsService.getInstance();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('getInstance', () => {
    it('returns singleton instance', () => {
      const instance1 = ClipboardService.getInstance();
      const instance2 = ClipboardService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('copyToClipboard', () => {
    it('writes text via the Clipboard API in every environment', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      stubBrowserGlobals(writeText);

      await clipboardService.copyToClipboard('test text');

      expect(writeText).toHaveBeenCalledWith('test text');
      expect(notificationsService.success).toHaveBeenCalledWith(
        'Copied to clipboard',
      );
    });

    it('falls back to execCommand when Clipboard API rejects', async () => {
      stubBrowserGlobals(vi.fn().mockRejectedValue(new Error('denied')));
      execCommand.mockReturnValue(true);

      await clipboardService.copyToClipboard('fallback text');

      expect(execCommand).toHaveBeenCalledWith('copy');
      expect(notificationsService.success).toHaveBeenCalledWith(
        'Copied to clipboard',
      );
      expect(notificationsService.error).not.toHaveBeenCalled();
    });

    it('surfaces failure when no clipboard path works', async () => {
      const mockError = new Error('Clipboard write failed');
      stubBrowserGlobals(vi.fn().mockRejectedValue(mockError));
      execCommand.mockReturnValue(false);

      await clipboardService.copyToClipboard('test text');

      expect(logger.error).toHaveBeenCalledWith(
        'Copy to clipboard failed',
        mockError,
      );
      expect(notificationsService.error).toHaveBeenCalledWith(
        'Copy to clipboard failed',
      );
    });

    it('resets isCopying after success', async () => {
      stubBrowserGlobals(vi.fn().mockResolvedValue(undefined));

      await clipboardService.copyToClipboard('test text');

      expect(clipboardService.isCopyingToClipboard).toBe(false);
    });
  });

  describe('isCopyingToClipboard', () => {
    it('returns false initially', () => {
      expect(clipboardService.isCopyingToClipboard).toBe(false);
    });
  });
});
