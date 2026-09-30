import { useFormSubmitWithState } from '@hooks/utils/use-form-submit/use-form-submit';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/test'),
}));

describe('useFormSubmitWithState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns submit handler and state', () => {
    const mockHandler = vi.fn();
    const { result } = renderHook(() => useFormSubmitWithState(mockHandler));
    expect(result.current).toHaveProperty('onSubmit');
    expect(result.current).toHaveProperty('isSubmitting');
    expect(result.current).toHaveProperty('setNavigating');
  });

  it('initializes with not submitting state', () => {
    const mockHandler = vi.fn();
    const { result } = renderHook(() => useFormSubmitWithState(mockHandler));
    expect(result.current.isSubmitting).toBe(false);
  });

  it('onSubmit prevents default event and calls handler', async () => {
    const mockHandler = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useFormSubmitWithState(mockHandler));

    const mockEvent = {
      preventDefault: vi.fn(),
    } as unknown as React.FormEvent<HTMLFormElement>;

    await act(async () => {
      await result.current.onSubmit(mockEvent);
    });

    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockHandler).toHaveBeenCalled();
  });

  it('sets isSubmitting true during handler execution', async () => {
    let resolveHandler: (() => void) | null = null;
    const mockHandler = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveHandler = resolve;
        }),
    );
    const { result } = renderHook(() => useFormSubmitWithState(mockHandler));

    const mockEvent = {
      preventDefault: vi.fn(),
    } as unknown as React.FormEvent<HTMLFormElement>;

    act(() => {
      result.current.onSubmit(mockEvent);
    });

    await waitFor(() => {
      expect(result.current.isSubmitting).toBe(true);
    });

    // Resolve the handler
    act(() => {
      resolveHandler?.();
    });

    await waitFor(() => {
      expect(result.current.isSubmitting).toBe(false);
    });
  });

  it('resets isSubmitting false after handler completes', async () => {
    const mockHandler = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useFormSubmitWithState(mockHandler));

    const mockEvent = {
      preventDefault: vi.fn(),
    } as unknown as React.FormEvent<HTMLFormElement>;

    await act(async () => {
      await result.current.onSubmit(mockEvent);
    });

    expect(result.current.isSubmitting).toBe(false);
  });

  it('resets isSubmitting false when handler throws', async () => {
    const mockHandler = vi.fn().mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() => useFormSubmitWithState(mockHandler));

    const mockEvent = {
      preventDefault: vi.fn(),
    } as unknown as React.FormEvent<HTMLFormElement>;

    await act(async () => {
      await result.current.onSubmit(mockEvent);
    });

    expect(result.current.isSubmitting).toBe(false);
  });

  it('setNavigating sets internal navigation flag', () => {
    const mockHandler = vi.fn();
    const { result } = renderHook(() => useFormSubmitWithState(mockHandler));
    // Should not throw
    expect(() => result.current.setNavigating(true)).not.toThrow();
    expect(() => result.current.setNavigating(false)).not.toThrow();
  });
});
