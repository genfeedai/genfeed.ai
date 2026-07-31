import { usePromptBarSubmission } from '@hooks/prompt-bar/use-prompt-bar-submission/use-prompt-bar-submission';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('usePromptBarSubmission', () => {
  it('starts with an empty prompt and a disabled submit', () => {
    const { result } = renderHook(() =>
      usePromptBarSubmission({ isEnhancing: false, onSubmit: vi.fn() }),
    );

    expect(result.current.prompt).toBe('');
    expect(result.current.isSubmitDisabled).toBe(true);
  });

  it('submits the trimmed prompt and clears on success', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      usePromptBarSubmission({ isEnhancing: false, onSubmit }),
    );

    act(() => {
      result.current.setPrompt('  make it punchier  ');
    });
    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(onSubmit).toHaveBeenCalledWith('make it punchier');
    expect(result.current.prompt).toBe('');
  });

  it('ignores a whitespace-only prompt', async () => {
    const onSubmit = vi.fn();
    const { result } = renderHook(() =>
      usePromptBarSubmission({ isEnhancing: false, onSubmit }),
    );

    act(() => {
      result.current.setPrompt('   ');
    });
    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.isSubmitDisabled).toBe(true);
  });

  it('refuses to submit while an enhancement is in flight', async () => {
    const onSubmit = vi.fn();
    const { result } = renderHook(() =>
      usePromptBarSubmission({ isEnhancing: true, onSubmit }),
    );

    act(() => {
      result.current.setPrompt('rewrite this');
    });
    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.isSubmitDisabled).toBe(true);
  });

  it('keeps the prompt when submission rejects', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() =>
      usePromptBarSubmission({ isEnhancing: false, onSubmit }),
    );

    act(() => {
      result.current.setPrompt('rewrite this');
    });
    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(onSubmit).toHaveBeenCalledWith('rewrite this');
    expect(result.current.prompt).toBe('rewrite this');
  });

  it('calls preventDefault on the submitting event', async () => {
    const preventDefault = vi.fn();
    const { result } = renderHook(() =>
      usePromptBarSubmission({ isEnhancing: false, onSubmit: vi.fn() }),
    );

    act(() => {
      result.current.setPrompt('rewrite this');
    });
    await act(async () => {
      await result.current.handleSubmit({
        preventDefault,
      } as unknown as Parameters<typeof result.current.handleSubmit>[0]);
    });

    expect(preventDefault).toHaveBeenCalled();
  });

  it('submits on Enter without Shift', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      usePromptBarSubmission({ isEnhancing: false, onSubmit }),
    );

    act(() => {
      result.current.setPrompt('rewrite this');
    });
    await act(async () => {
      result.current.handleKeyDown({
        key: 'Enter',
        preventDefault: vi.fn(),
        shiftKey: false,
      } as unknown as Parameters<typeof result.current.handleKeyDown>[0]);
    });

    expect(onSubmit).toHaveBeenCalledWith('rewrite this');
  });

  it('inserts a newline on Shift+Enter instead of submitting', async () => {
    const onSubmit = vi.fn();
    const preventDefault = vi.fn();
    const { result } = renderHook(() =>
      usePromptBarSubmission({ isEnhancing: false, onSubmit }),
    );

    act(() => {
      result.current.setPrompt('rewrite this');
    });
    await act(async () => {
      result.current.handleKeyDown({
        key: 'Enter',
        preventDefault,
        shiftKey: true,
      } as unknown as Parameters<typeof result.current.handleKeyDown>[0]);
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('uses the latest onSubmit handler after a rerender', async () => {
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ onSubmit }) =>
        usePromptBarSubmission({ isEnhancing: false, onSubmit }),
      { initialProps: { onSubmit: first } },
    );

    act(() => {
      result.current.setPrompt('rewrite this');
    });
    rerender({ onSubmit: second });
    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('rewrite this');
  });
});
