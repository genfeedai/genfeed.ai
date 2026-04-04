import { NotificationsService } from '@services/core/notifications.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sonnerMocks = vi.hoisted(() => ({
  errorMock: vi.fn(),
  infoMock: vi.fn(),
  successMock: vi.fn(),
  warningMock: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: sonnerMocks.errorMock,
    info: sonnerMocks.infoMock,
    success: sonnerMocks.successMock,
    warning: sonnerMocks.warningMock,
  },
}));

describe('NotificationsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    NotificationsService.clearInstance();
  });

  describe('getInstance', () => {
    it('returns singleton instance', () => {
      const instance1 = NotificationsService.getInstance();
      const instance2 = NotificationsService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('notification types', () => {
    let service: NotificationsService;

    beforeEach(() => {
      service = NotificationsService.getInstance();
    });

    it('has success method', () => {
      expect(service.success).toBeDefined();
      expect(typeof service.success).toBe('function');
    });

    it('has error method', () => {
      expect(service.error).toBeDefined();
      expect(typeof service.error).toBe('function');
    });

    it('has warning method', () => {
      expect(service.warning).toBeDefined();
      expect(typeof service.warning).toBe('function');
    });

    it('has info method', () => {
      expect(service.info).toBeDefined();
      expect(typeof service.info).toBe('function');
    });

    it('passes rich toast options through to sonner', () => {
      const onAction = vi.fn();

      service.info('Image generation started', {
        actionLabel: 'View',
        description: 'Track progress in Activity',
        duration: 5_000,
        onAction,
      });

      expect(sonnerMocks.infoMock).toHaveBeenCalledWith(
        'Image generation started',
        {
          action: {
            label: 'View',
            onClick: onAction,
          },
          description: 'Track progress in Activity',
          duration: 5_000,
        },
      );
    });

    it('keeps warning timeout compatibility', () => {
      service.warning('Heads up', 4_000);

      expect(sonnerMocks.warningMock).toHaveBeenCalledWith('Heads up', {
        action: undefined,
        description: undefined,
        duration: 4_000,
      });
    });
  });
});
