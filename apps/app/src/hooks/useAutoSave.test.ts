import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoSave } from './useAutoSave';

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock store values
const mockSaveWorkflow = vi.fn();
let mockIsDirty = false;
let mockIsSaving = false;
let mockNodes: { id: string }[] = [];

const mockState = () => ({
  isDirty: mockIsDirty,
  isSaving: mockIsSaving,
  nodes: mockNodes,
  saveWorkflow: mockSaveWorkflow,
});

vi.mock('@/store/workflowStore', () => {
  const store = (selector: (state: unknown) => unknown) => selector(mockState());
  store.getState = () => mockState();
  return { useWorkflowStore: store };
});

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockIsDirty = false;
    mockIsSaving = false;
    mockNodes = [];
    mockSaveWorkflow.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('should return isSaving as false initially', () => {
      const { result } = renderHook(() => useAutoSave());

      expect(result.current.isSaving).toBe(false);
    });

    it('should return lastSavedAt as null initially', () => {
      const { result } = renderHook(() => useAutoSave());

      expect(result.current.lastSavedAt).toBeNull();
    });
  });

  describe('auto-save trigger', () => {
    it('should not trigger save when disabled', () => {
      mockIsDirty = true;
      mockNodes = [{ id: 'node-1' }];

      renderHook(() => useAutoSave(false));

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(mockSaveWorkflow).not.toHaveBeenCalled();
    });

    it('should not trigger save when not dirty', () => {
      mockIsDirty = false;
      mockNodes = [{ id: 'node-1' }];

      renderHook(() => useAutoSave());

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(mockSaveWorkflow).not.toHaveBeenCalled();
    });

    it('should not trigger save when already saving', () => {
      mockIsDirty = true;
      mockIsSaving = true;
      mockNodes = [{ id: 'node-1' }];

      renderHook(() => useAutoSave());

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(mockSaveWorkflow).not.toHaveBeenCalled();
    });

    it('should not trigger save when workflow is empty', () => {
      mockIsDirty = true;
      mockNodes = [];

      renderHook(() => useAutoSave());

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(mockSaveWorkflow).not.toHaveBeenCalled();
    });

    it('should trigger save after delay of inactivity', async () => {
      mockIsDirty = true;
      mockNodes = [{ id: 'node-1' }];

      renderHook(() => useAutoSave());

      await act(async () => {
        vi.advanceTimersByTime(2500);
      });

      expect(mockSaveWorkflow).toHaveBeenCalledTimes(1);
    });

    it('should pass AbortController signal to saveWorkflow', async () => {
      mockIsDirty = true;
      mockNodes = [{ id: 'node-1' }];

      renderHook(() => useAutoSave());

      await act(async () => {
        vi.advanceTimersByTime(2500);
      });

      expect(mockSaveWorkflow).toHaveBeenCalledWith(expect.any(AbortSignal));
    });
  });

  describe('debouncing', () => {
    it('should debounce rapid changes', async () => {
      mockIsDirty = true;
      mockNodes = [{ id: 'node-1' }];

      const { rerender } = renderHook(() => useAutoSave());

      // Advance partway through delay
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // Trigger rerender with changed nodes (resets the debounce timer)
      mockNodes = [{ id: 'node-1' }, { id: 'node-2' }];
      rerender();

      // Advance another 1000ms - still within new debounce window
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // Should not have saved yet since timer was reset
      expect(mockSaveWorkflow).not.toHaveBeenCalled();

      // Wait for full debounce period from last change
      await act(async () => {
        vi.advanceTimersByTime(2500);
      });

      expect(mockSaveWorkflow).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanup', () => {
    it('should cleanup timeout on unmount', async () => {
      mockIsDirty = true;
      mockNodes = [{ id: 'node-1' }];

      const { unmount } = renderHook(() => useAutoSave());

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      unmount();

      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      // Should not have saved since component was unmounted
      expect(mockSaveWorkflow).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle save errors gracefully', async () => {
      mockIsDirty = true;
      mockNodes = [{ id: 'node-1' }];
      mockSaveWorkflow.mockRejectedValue(new Error('Save failed'));

      renderHook(() => useAutoSave());

      await act(async () => {
        vi.advanceTimersByTime(2500);
      });

      expect(mockSaveWorkflow).toHaveBeenCalled();
      // Should not throw
    });

    it('should not log AbortError', async () => {
      const { logger } = await import('@/lib/logger');
      mockIsDirty = true;
      mockNodes = [{ id: 'node-1' }];

      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockSaveWorkflow.mockRejectedValue(abortError);

      renderHook(() => useAutoSave());

      await act(async () => {
        vi.advanceTimersByTime(2500);
      });

      expect(logger.error).not.toHaveBeenCalled();
    });
  });
});
