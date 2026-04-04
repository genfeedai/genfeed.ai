import type { IIngredient } from '@genfeedai/interfaces';
import { act, renderHook } from '@testing-library/react';
import type { MouseEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted so mock fns are available before vi.mock factories run
const { mockDownloadIngredient, mockNotificationsError } = vi.hoisted(() => ({
  mockDownloadIngredient: vi.fn(),
  mockNotificationsError: vi.fn(),
}));

vi.mock('@helpers/media/download/download.helper', () => ({
  downloadIngredient: mockDownloadIngredient,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: mockNotificationsError,
    })),
  },
}));

import {
  createDownloadHandler,
  useMasonryHover,
} from '@ui/masonry/shared/useMasonryHover';

describe('useMasonryHover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should return initial state', () => {
      const { result } = renderHook(() => useMasonryHover());

      expect(result.current.isHovered).toBe(false);
      expect(result.current.showActions).toBe(false);
      expect(typeof result.current.handleMouseEnter).toBe('function');
      expect(typeof result.current.handleMouseLeave).toBe('function');
      expect(typeof result.current.handleQuickActionsMouseEnter).toBe(
        'function',
      );
      expect(typeof result.current.handleQuickActionsMouseLeave).toBe(
        'function',
      );
      expect(typeof result.current.setShowActions).toBe('function');
    });
  });

  describe('handleMouseEnter', () => {
    it('should set isHovered and showActions to true', () => {
      const { result } = renderHook(() => useMasonryHover());

      act(() => {
        result.current.handleMouseEnter();
      });

      expect(result.current.isHovered).toBe(true);
      expect(result.current.showActions).toBe(true);
    });

    it('should call onHoverChange callback', () => {
      const onHoverChange = vi.fn();
      const { result } = renderHook(() => useMasonryHover({ onHoverChange }));

      act(() => {
        result.current.handleMouseEnter();
      });

      expect(onHoverChange).toHaveBeenCalledWith(true);
    });

    it('should call onHoverStateChange callback', () => {
      const onHoverStateChange = vi.fn();
      const { result } = renderHook(() =>
        useMasonryHover({ onHoverStateChange }),
      );

      act(() => {
        result.current.handleMouseEnter();
      });

      expect(onHoverStateChange).toHaveBeenCalledWith(true);
    });
  });

  describe('handleMouseLeave', () => {
    it('should set isHovered and showActions to false when relatedTarget is null', () => {
      const { result } = renderHook(() => useMasonryHover());

      act(() => {
        result.current.handleMouseEnter();
      });

      expect(result.current.isHovered).toBe(true);

      act(() => {
        result.current.handleMouseLeave({
          currentTarget: document.createElement('div'),
          relatedTarget: null,
        } as unknown as MouseEvent);
      });

      expect(result.current.isHovered).toBe(false);
      expect(result.current.showActions).toBe(false);
    });

    it('should not hide when moving to dropdown', () => {
      const { result } = renderHook(() => useMasonryHover());

      act(() => {
        result.current.handleMouseEnter();
      });

      const dropdownElement = document.createElement('div');
      dropdownElement.setAttribute('data-dropdown', 'true');

      act(() => {
        result.current.handleMouseLeave({
          currentTarget: document.createElement('div'),
          relatedTarget: dropdownElement,
        } as unknown as MouseEvent);
      });

      expect(result.current.isHovered).toBe(true);
    });

    it('should not hide when moving to role=menu element', () => {
      const { result } = renderHook(() => useMasonryHover());

      act(() => {
        result.current.handleMouseEnter();
      });

      const menuElement = document.createElement('div');
      menuElement.setAttribute('role', 'menu');

      act(() => {
        result.current.handleMouseLeave({
          currentTarget: document.createElement('div'),
          relatedTarget: menuElement,
        } as unknown as MouseEvent);
      });

      expect(result.current.isHovered).toBe(true);
    });
  });

  describe('handleQuickActionsMouseEnter', () => {
    it('should set isHovered and showActions to true', () => {
      const { result } = renderHook(() => useMasonryHover());

      act(() => {
        result.current.handleQuickActionsMouseEnter();
      });

      expect(result.current.isHovered).toBe(true);
      expect(result.current.showActions).toBe(true);
    });
  });

  describe('handleQuickActionsMouseLeave', () => {
    it('should set isHovered and showActions to false when leaving', () => {
      const { result } = renderHook(() => useMasonryHover());

      act(() => {
        result.current.handleQuickActionsMouseEnter();
      });

      act(() => {
        result.current.handleQuickActionsMouseLeave({
          currentTarget: document.createElement('div'),
          relatedTarget: document.createElement('div'),
        } as unknown as MouseEvent);
      });

      expect(result.current.isHovered).toBe(false);
    });

    it('should not hide when moving to dropdown', () => {
      const { result } = renderHook(() => useMasonryHover());

      act(() => {
        result.current.handleQuickActionsMouseEnter();
      });

      const dropdownElement = document.createElement('div');
      dropdownElement.setAttribute('data-quick-actions-dropdown', 'true');

      act(() => {
        result.current.handleQuickActionsMouseLeave({
          currentTarget: document.createElement('div'),
          relatedTarget: dropdownElement,
        } as unknown as MouseEvent);
      });

      expect(result.current.isHovered).toBe(true);
    });
  });

  describe('setShowActions', () => {
    it('should update showActions directly', () => {
      const { result } = renderHook(() => useMasonryHover());

      act(() => {
        result.current.setShowActions(true);
      });

      expect(result.current.showActions).toBe(true);

      act(() => {
        result.current.setShowActions(false);
      });

      expect(result.current.showActions).toBe(false);
    });
  });

  describe('isContainerHovered', () => {
    it('should reset state when container is no longer hovered', () => {
      const { result, rerender } = renderHook(
        ({ isContainerHovered }) => useMasonryHover({ isContainerHovered }),
        { initialProps: { isContainerHovered: true } },
      );

      act(() => {
        result.current.handleMouseEnter();
      });

      expect(result.current.isHovered).toBe(true);

      rerender({ isContainerHovered: false });

      // Wait for transition
      expect(result.current.isHovered).toBe(false);
      expect(result.current.showActions).toBe(false);
    });
  });
});

describe('createDownloadHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return a download handler function', () => {
    const handler = createDownloadHandler();

    expect(typeof handler).toBe('function');
  });

  it('should call downloadIngredient with ingredient', async () => {
    const handler = createDownloadHandler();
    const mockIngredient: IIngredient = {
      id: 'ing-123',
      ingredientUrl: 'https://example.com/image.png',
    } as IIngredient;

    mockDownloadIngredient.mockResolvedValue(undefined);

    await handler(mockIngredient);

    expect(mockDownloadIngredient).toHaveBeenCalledWith(mockIngredient);
  });

  it('should show error notification on download failure', async () => {
    const handler = createDownloadHandler();
    const mockIngredient: IIngredient = {
      id: 'ing-123',
    } as IIngredient;

    mockDownloadIngredient.mockRejectedValue(new Error('Download failed'));

    await handler(mockIngredient);

    expect(mockNotificationsError).toHaveBeenCalledWith(
      'Failed to download file',
    );
  });
});
