// @vitest-environment jsdom
import { ClipboardService } from '@services/core/clipboard.service';
import { deferredLogger } from '@services/core/deferred-logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ClipboardService loads the notifications singleton on each copy, so the mock
// hands back the same object on every call — an inline `vi.fn(() => ({ ... }))`
// would give the test a different stub than the one under assertion.
const notificationsStub = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => notificationsStub),
  },
}));
vi.mock('./deferred-logger', () => ({
  deferredLogger: { error: vi.fn() },
}));

describe('ClipboardService', () => {
  let clipboardService: ClipboardService;
  const notificationsService = notificationsStub;

  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom ships no execCommand at all, and vi.spyOn refuses to stub a
    // property that does not exist. Define it so the fallback-path tests
    // have something to spy on.
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => false),
      writable: true,
    });
    clipboardService = ClipboardService.getInstance();
  });

  afterEach(() => {
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
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: mockWriteText },
        writable: true,
      });

      await clipboardService.copyToClipboard('test text');

      expect(mockWriteText).toHaveBeenCalledWith('test text');
      expect(notificationsService.success).toHaveBeenCalledWith(
        'Copied to clipboard',
      );
    });

    // Safari drops the click's user activation across an awaited import, so
    // the write must start before the toast module loads.
    it('starts the clipboard write synchronously, before loading the toast', async () => {
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: mockWriteText },
        writable: true,
      });

      const copying = clipboardService.copyToClipboard('in the gesture');

      expect(mockWriteText).toHaveBeenCalledWith('in the gesture');
      expect(notificationsService.success).not.toHaveBeenCalled();
      await copying;
      expect(notificationsService.success).toHaveBeenCalledWith(
        'Copied to clipboard',
      );
    });

    it('falls back to execCommand when Clipboard API rejects', async () => {
      const mockWriteText = vi.fn().mockRejectedValue(new Error('denied'));
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: mockWriteText },
        writable: true,
      });
      const execSpy = vi.spyOn(document, 'execCommand').mockReturnValue(true);

      await clipboardService.copyToClipboard('fallback text');

      expect(execSpy).toHaveBeenCalledWith('copy');
      expect(notificationsService.success).toHaveBeenCalledWith(
        'Copied to clipboard',
      );
      expect(notificationsService.error).not.toHaveBeenCalled();
    });

    it('surfaces failure when no clipboard path works', async () => {
      const mockError = new Error('Clipboard write failed');
      const mockWriteText = vi.fn().mockRejectedValue(mockError);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: mockWriteText },
        writable: true,
      });
      vi.spyOn(document, 'execCommand').mockReturnValue(false);

      await clipboardService.copyToClipboard('test text');

      expect(deferredLogger.error).toHaveBeenCalledWith(
        'Copy to clipboard failed',
        mockError,
      );
      expect(notificationsService.error).toHaveBeenCalledWith(
        'Copy to clipboard failed',
      );
    });

    it('resets isCopying after success', async () => {
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: mockWriteText },
        writable: true,
      });

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
