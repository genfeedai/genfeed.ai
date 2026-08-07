// @vitest-environment jsdom

import { ClipboardService } from '@services/core/clipboard.service';
import { logger } from '@services/core/logger.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const notificationsStub = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => notificationsStub,
  },
}));
vi.mock('./logger.service');

describe('ClipboardService', () => {
  let clipboardService: ClipboardService;
  const notificationsService = notificationsStub;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
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

      expect(logger.error).toHaveBeenCalledWith(
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
