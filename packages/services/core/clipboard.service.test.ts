import { ClipboardService } from '@services/core/clipboard.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Track mock production state
let mockIsProduction = true;

// Mock dependencies
vi.mock('./notifications.service');
vi.mock('./environment.service', () => ({
  EnvironmentService: {
    get isProduction() {
      return mockIsProduction;
    },
  },
}));
vi.mock('./logger.service');

describe('ClipboardService', () => {
  let clipboardService: ClipboardService;
  let notificationsService: NotificationsService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsProduction = true; // Default to production
    clipboardService = ClipboardService.getInstance();
    notificationsService = NotificationsService.getInstance();
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

  // TODO: These tests need to be fixed - singleton pattern with getInstance()
  // creates the instance before mocks are properly configured
  describe.skip('copyToClipboard', () => {
    it('copies text to clipboard in production', async () => {
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: mockWriteText },
        writable: true,
      });

      mockIsProduction = true;

      await clipboardService.copyToClipboard('test text');

      expect(mockWriteText).toHaveBeenCalledWith('test text');
      expect(notificationsService.success).toHaveBeenCalledWith(
        'Copied to clipboard',
      );
    });

    it('shows success notification after copying', async () => {
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: mockWriteText },
        writable: true,
      });

      mockIsProduction = true;

      await clipboardService.copyToClipboard('test text');

      expect(notificationsService.success).toHaveBeenCalledWith(
        'Copied to clipboard',
      );
    });

    it('handles clipboard write failure', async () => {
      const mockError = new Error('Clipboard write failed');
      const mockWriteText = vi.fn().mockRejectedValue(mockError);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: mockWriteText },
        writable: true,
      });

      mockIsProduction = true;

      await clipboardService.copyToClipboard('test text');

      expect(logger.error).toHaveBeenCalledWith(
        'Copy to clipboard failed',
        mockError,
      );
      expect(notificationsService.error).toHaveBeenCalledWith(
        'Copy to clipboard failed',
      );
    });

    it('sets isCopying flag during copy operation', async () => {
      const mockWriteText = vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            expect(clipboardService.isCopyingToClipboard).toBe(true);
            resolve(undefined);
          }, 10);
        });
      });

      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: mockWriteText },
        writable: true,
      });

      mockIsProduction = true;

      await clipboardService.copyToClipboard('test text');

      expect(clipboardService.isCopyingToClipboard).toBe(false);
    });

    it('resets isCopying flag after error', async () => {
      const mockError = new Error('Clipboard write failed');
      const mockWriteText = vi.fn().mockRejectedValue(mockError);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: mockWriteText },
        writable: true,
      });

      mockIsProduction = true;

      await clipboardService.copyToClipboard('test text');

      expect(clipboardService.isCopyingToClipboard).toBe(false);
    });

    it('skips clipboard write in development', async () => {
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: mockWriteText },
        writable: true,
      });

      mockIsProduction = false;

      await clipboardService.copyToClipboard('test text');

      expect(mockWriteText).not.toHaveBeenCalled();
      expect(notificationsService.success).toHaveBeenCalledWith(
        'Copied to clipboard',
      );
    });
  });

  describe('isCopyingToClipboard', () => {
    it('returns false initially', () => {
      expect(clipboardService.isCopyingToClipboard).toBe(false);
    });
  });
});
