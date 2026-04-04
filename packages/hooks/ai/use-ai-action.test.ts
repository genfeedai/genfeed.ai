import { useAiAction } from '@hooks/ai/use-ai-action';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockExecute = vi.fn();

vi.mock('@services/ai/ai-actions.service', () => ({
  AiActionsService: {
    getInstance: vi.fn(() => ({
      execute: mockExecute,
    })),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

describe('useAiAction', () => {
  const options = { orgId: 'org-1', token: 'test-token' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue({ result: 'AI output' });
  });

  it('returns required fields', () => {
    const { result } = renderHook(() =>
      useAiAction('rewrite' as never, options),
    );
    expect(result.current).toHaveProperty('execute');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('result');
    expect(result.current).toHaveProperty('error');
    expect(result.current).toHaveProperty('undo');
    expect(result.current).toHaveProperty('previousValue');
  });

  it('initializes with null values and isLoading false', () => {
    const { result } = renderHook(() =>
      useAiAction('rewrite' as never, options),
    );
    expect(result.current.isLoading).toBe(false);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.previousValue).toBeNull();
  });

  it('executes and returns result', async () => {
    const { result } = renderHook(() =>
      useAiAction('rewrite' as never, options),
    );

    let returnVal: string | undefined;
    await act(async () => {
      returnVal = await result.current.execute('original content');
    });

    expect(returnVal).toBe('AI output');
    expect(result.current.result).toBe('AI output');
    expect(result.current.isLoading).toBe(false);
  });

  it('sets previousValue before executing', async () => {
    const { result } = renderHook(() =>
      useAiAction('rewrite' as never, options),
    );

    await act(async () => {
      await result.current.execute('original content');
    });

    expect(result.current.previousValue).toBe('original content');
  });

  it('undo restores previous value', async () => {
    const { result } = renderHook(() =>
      useAiAction('rewrite' as never, options),
    );

    await act(async () => {
      await result.current.execute('original content');
    });

    act(() => {
      result.current.undo();
    });

    expect(result.current.result).toBe('original content');
    expect(result.current.previousValue).toBeNull();
  });

  it('handles errors and sets error state', async () => {
    mockExecute.mockRejectedValue(new Error('AI service failed'));

    const { result } = renderHook(() =>
      useAiAction('rewrite' as never, options),
    );

    await act(async () => {
      await result.current.execute('content');
    });

    await waitFor(() => {
      expect(result.current.error).toBe('AI service failed');
    });
    expect(result.current.isLoading).toBe(false);
  });
});
