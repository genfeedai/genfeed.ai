import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ────────────────────────────────────────────────────────────
// Mock every service boundary before importing the hook
// ────────────────────────────────────────────────────────────

vi.mock('@genfeedai/contracts/constants', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@genfeedai/contracts/constants')>();
  return {
    ...actual,
    MODEL_OUTPUT_CAPABILITIES: {
      'google/veo-3.1': { category: 'video' },
      'openai/dall-e-3': { category: 'image' },
    },
  };
});

vi.mock('@genfeedai/models/content/prompt.model', () => ({
  Prompt: class {
    constructor(data: Record<string, unknown>) {
      Object.assign(this, data);
    }
  },
}));

const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();
vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({ subscribe: mockSubscribe }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('stub-token'),
}));

const mockPromptsPost = vi.fn();
vi.mock('@services/content/prompts.service', () => ({
  PromptsService: { getInstance: () => ({ post: mockPromptsPost }) },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const mockNotificationsError = vi.fn();
const mockNotificationsInfo = vi.fn();
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mockNotificationsError,
      info: mockNotificationsInfo,
    }),
  },
}));

vi.mock('@services/core/socket-manager.service', () => ({
  createPromptHandler: vi.fn(
    (
      onCompleted: (result: string) => void,
      onFailed?: (error: string) => void,
    ) => ({
      onCompleted,
      onFailed,
    }),
  ),
}));

vi.mock('@utils/network/websocket.util', () => ({
  WebSocketPaths: { prompt: (id: string) => `prompt:${id}` },
}));

import { useStudioPromptEnhancement } from '@pages/studio/generate/hooks/useStudioPromptEnhancement';

function getSubscribedHandler() {
  return mockSubscribe.mock.calls[0]?.[1] as {
    onCompleted: (result: string) => void;
    onFailed?: (error: string) => void;
  };
}

describe('useStudioPromptEnhancement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscribe.mockReturnValue(mockUnsubscribe);
    mockPromptsPost.mockResolvedValue({ id: 'prompt-123' });
  });

  it('starts idle', () => {
    const { result } = renderHook(() =>
      useStudioPromptEnhancement({
        brandId: 'brand-1',
        modelKey: 'openai/dall-e-3',
        onPromptChange: vi.fn(),
        prompt: 'a founder at a desk',
      }),
    );

    expect(result.current.isEnhancing).toBe(false);
    expect(result.current.previousPrompt).toBeNull();
  });

  it('does nothing for an empty prompt — never blocks or starts a generation', async () => {
    const onPromptChange = vi.fn();
    const { result } = renderHook(() =>
      useStudioPromptEnhancement({
        brandId: 'brand-1',
        modelKey: 'openai/dall-e-3',
        onPromptChange,
        prompt: '   ',
      }),
    );

    await act(async () => {
      await result.current.enhancePrompt();
    });

    expect(mockPromptsPost).not.toHaveBeenCalled();
    expect(result.current.isEnhancing).toBe(false);
  });

  it('posts an unskipped-enhancement prompt and subscribes for the result', async () => {
    const { result } = renderHook(() =>
      useStudioPromptEnhancement({
        brandId: 'brand-1',
        modelKey: 'openai/dall-e-3',
        onPromptChange: vi.fn(),
        prompt: 'a founder at a desk',
      }),
    );

    await act(async () => {
      await result.current.enhancePrompt();
    });

    expect(mockPromptsPost).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        isSkipEnhancement: false,
        original: 'a founder at a desk',
      }),
    );
    expect(mockSubscribe).toHaveBeenCalledWith(
      'prompt:prompt-123',
      expect.any(Object),
    );
    expect(result.current.isEnhancing).toBe(true);
  });

  it('replaces the prompt in place when enhancement completes, without generating', async () => {
    const onPromptChange = vi.fn();
    const { result } = renderHook(() =>
      useStudioPromptEnhancement({
        brandId: 'brand-1',
        modelKey: 'openai/dall-e-3',
        onPromptChange,
        prompt: 'a founder at a desk',
      }),
    );

    await act(async () => {
      await result.current.enhancePrompt();
    });

    act(() => {
      getSubscribedHandler().onCompleted('An enhanced, brand-aware prompt');
    });

    expect(onPromptChange).toHaveBeenCalledWith(
      'An enhanced, brand-aware prompt',
    );
    expect(result.current.isEnhancing).toBe(false);
    expect(result.current.previousPrompt).toBe('a founder at a desk');
  });

  it('does not overwrite an edit made while enhancement was in flight (#4676)', async () => {
    const onPromptChange = vi.fn();
    const { rerender, result } = renderHook(
      (props: { prompt: string }) =>
        useStudioPromptEnhancement({
          brandId: 'brand-1',
          modelKey: 'openai/dall-e-3',
          onPromptChange,
          prompt: props.prompt,
        }),
      { initialProps: { prompt: 'a founder at a desk' } },
    );

    await act(async () => {
      await result.current.enhancePrompt();
    });

    // The operator edits the prompt while the request is still in flight.
    rerender({ prompt: 'a founder at a standing desk' });

    act(() => {
      getSubscribedHandler().onCompleted('An enhanced, brand-aware prompt');
    });

    expect(onPromptChange).not.toHaveBeenCalled();
    expect(result.current.previousPrompt).toBeNull();
    expect(mockNotificationsInfo).toHaveBeenCalledWith(
      expect.stringContaining('discarded'),
    );
    expect(result.current.isEnhancing).toBe(false);
  });

  it('applies the result when a skill token was stripped from the prompt', async () => {
    // Regression: staleness used to compare the live composer (which still
    // holds `/brand-interview`) against the stripped text sent for
    // enhancement, so every picked-skill enhancement was discarded as if the
    // operator had edited it mid-flight.
    const onPromptChange = vi.fn();
    const { result } = renderHook(() =>
      useStudioPromptEnhancement({
        brandId: 'brand-1',
        modelKey: 'openai/dall-e-3',
        onPromptChange,
        prompt: '/cinematic-prompting a founder at a desk',
        resolveRequestedSkills: (value: string) => ({
          content: value.replace('/cinematic-prompting ', ''),
          skillSlugs: ['cinematic-prompting'],
        }),
      }),
    );

    await act(async () => {
      await result.current.enhancePrompt();
    });

    // The token is stripped from what we send, and the slug rides along.
    expect(mockPromptsPost).toHaveBeenCalledWith(
      expect.objectContaining({
        original: 'a founder at a desk',
        requestedSkillSlugs: ['cinematic-prompting'],
      }),
    );

    act(() => {
      getSubscribedHandler().onCompleted('A cinematic, brand-aware prompt');
    });

    expect(onPromptChange).toHaveBeenCalledWith(
      'A cinematic, brand-aware prompt',
    );
    expect(mockNotificationsInfo).not.toHaveBeenCalled();
    // Undo restores what the operator actually had, token included.
    expect(result.current.previousPrompt).toBe(
      '/cinematic-prompting a founder at a desk',
    );
  });

  it('restores the previous prompt on undo', async () => {
    const onPromptChange = vi.fn();
    const { result } = renderHook(() =>
      useStudioPromptEnhancement({
        brandId: 'brand-1',
        modelKey: 'openai/dall-e-3',
        onPromptChange,
        prompt: 'a founder at a desk',
      }),
    );

    await act(async () => {
      await result.current.enhancePrompt();
    });
    act(() => {
      getSubscribedHandler().onCompleted('An enhanced, brand-aware prompt');
    });

    act(() => {
      result.current.undoEnhance();
    });

    expect(onPromptChange).toHaveBeenLastCalledWith('a founder at a desk');
    expect(result.current.previousPrompt).toBeNull();
    expect(mockNotificationsInfo).toHaveBeenCalledWith('Prompt restored');
  });

  it('cancelEnhance stops a pending request and ignores its eventual result', async () => {
    const onPromptChange = vi.fn();
    const { result } = renderHook(() =>
      useStudioPromptEnhancement({
        brandId: 'brand-1',
        modelKey: 'openai/dall-e-3',
        onPromptChange,
        prompt: 'a founder at a desk',
      }),
    );

    await act(async () => {
      await result.current.enhancePrompt();
    });
    expect(result.current.isEnhancing).toBe(true);

    act(() => {
      result.current.cancelEnhance();
    });
    expect(result.current.isEnhancing).toBe(false);
    expect(mockUnsubscribe).toHaveBeenCalled();

    // Even if a result arrives after cancellation, it must never apply.
    act(() => {
      getSubscribedHandler().onCompleted('too late');
    });

    expect(onPromptChange).not.toHaveBeenCalled();
  });

  it('cancelEnhance is a harmless no-op when idle', () => {
    const { result } = renderHook(() =>
      useStudioPromptEnhancement({
        brandId: 'brand-1',
        modelKey: 'openai/dall-e-3',
        onPromptChange: vi.fn(),
        prompt: 'a founder at a desk',
      }),
    );

    expect(() => {
      act(() => {
        result.current.cancelEnhance();
      });
    }).not.toThrow();
    expect(result.current.isEnhancing).toBe(false);
  });

  it('keeps the original prompt and notifies on failure', async () => {
    const onPromptChange = vi.fn();
    const { result } = renderHook(() =>
      useStudioPromptEnhancement({
        brandId: 'brand-1',
        modelKey: 'openai/dall-e-3',
        onPromptChange,
        prompt: 'a founder at a desk',
      }),
    );

    await act(async () => {
      await result.current.enhancePrompt();
    });

    act(() => {
      getSubscribedHandler().onFailed?.('boom');
    });

    expect(onPromptChange).not.toHaveBeenCalled();
    expect(mockNotificationsError).toHaveBeenCalledWith(
      'Enhancement failed. Please try again.',
    );
    expect(result.current.isEnhancing).toBe(false);
  });

  it('notifies and stays enhancable when the POST itself fails', async () => {
    mockPromptsPost.mockRejectedValueOnce(new Error('network down'));
    const { result } = renderHook(() =>
      useStudioPromptEnhancement({
        brandId: 'brand-1',
        modelKey: 'openai/dall-e-3',
        onPromptChange: vi.fn(),
        prompt: 'a founder at a desk',
      }),
    );

    await act(async () => {
      await result.current.enhancePrompt();
    });

    expect(mockNotificationsError).toHaveBeenCalledWith(
      'Failed to enhance prompt',
    );
    expect(result.current.isEnhancing).toBe(false);
  });

  it('never notifies or applies a result after the component unmounts (#4676)', async () => {
    const onPromptChange = vi.fn();
    const { result, unmount } = renderHook(() =>
      useStudioPromptEnhancement({
        brandId: 'brand-1',
        modelKey: 'openai/dall-e-3',
        onPromptChange,
        prompt: 'a founder at a desk',
      }),
    );

    await act(async () => {
      await result.current.enhancePrompt();
    });
    const handler = getSubscribedHandler();

    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();

    act(() => {
      handler.onCompleted('too late');
    });

    expect(onPromptChange).not.toHaveBeenCalled();
    expect(mockNotificationsError).not.toHaveBeenCalled();
  });
  it('retains reviewed-text identity after the undo window expires', async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => {
        const [prompt, setPrompt] = useState('Original');
        return useStudioPromptEnhancement({
          brandId: 'brand-1',
          modelKey: 'openai/dall-e-3',
          prompt,
          onPromptChange: setPrompt,
        });
      });
      await act(async () => {
        await result.current.enhancePrompt();
      });
      act(() => getSubscribedHandler().onCompleted('Reviewed result'));
      expect(result.current.enhancedPromptId).toBe('prompt-123');
      act(() => vi.advanceTimersByTime(30001));
      expect(result.current.previousPrompt).toBeNull();
      expect(result.current.enhancedPromptId).toBe('prompt-123');
    } finally {
      vi.useRealTimers();
    }
  });

  it('invalidates reviewed identity on edits and undo', async () => {
    const { result } = renderHook(() => {
      const [prompt, setPrompt] = useState('Original');
      return {
        ...useStudioPromptEnhancement({
          brandId: 'brand-1',
          modelKey: 'openai/dall-e-3',
          prompt,
          onPromptChange: setPrompt,
        }),
        setPrompt,
      };
    });
    await act(async () => {
      await result.current.enhancePrompt();
    });
    act(() => getSubscribedHandler().onCompleted('Reviewed result'));
    expect(result.current.enhancedPromptId).toBe('prompt-123');
    act(() => result.current.undoEnhance());
    expect(result.current.enhancedPromptId).toBeUndefined();
    await act(async () => {
      await result.current.enhancePrompt();
    });
    act(() =>
      mockSubscribe.mock.calls.at(-1)?.[1].onCompleted('Reviewed again'),
    );
    expect(result.current.enhancedPromptId).toBe('prompt-123');
    act(() => result.current.setPrompt('Edited result'));
    expect(result.current.enhancedPromptId).toBeUndefined();
    act(() => result.current.setPrompt('Reviewed again'));
    expect(result.current.enhancedPromptId).toBeUndefined();
  });

  it.each(['brandId', 'modelKey'] as const)(
    'invalidates the reviewed result when %s changes',
    async (field) => {
      const originalScope = { brandId: 'brand-1', modelKey: 'openai/dall-e-3' };
      const { result, rerender } = renderHook(
        (scope) => {
          const [prompt, setPrompt] = useState('Original');
          return useStudioPromptEnhancement({
            ...scope,
            prompt,
            onPromptChange: setPrompt,
          });
        },
        { initialProps: originalScope },
      );
      await act(async () => {
        await result.current.enhancePrompt();
      });
      act(() => getSubscribedHandler().onCompleted('Reviewed result'));
      expect(result.current.enhancedPromptId).toBe('prompt-123');
      rerender({ ...originalScope, [field]: 'different' });
      expect(result.current.enhancedPromptId).toBeUndefined();
      rerender(originalScope);
      expect(result.current.enhancedPromptId).toBeUndefined();
    },
  );

  it('discards enhancement results from a previous brand/model scope', async () => {
    const onPromptChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ brandId }) =>
        useStudioPromptEnhancement({
          brandId,
          modelKey: 'openai/dall-e-3',
          prompt: 'Original',
          onPromptChange,
        }),
      { initialProps: { brandId: 'brand-1' } },
    );
    await act(async () => {
      await result.current.enhancePrompt();
    });
    const handler = getSubscribedHandler();
    rerender({ brandId: 'brand-2' });
    act(() => handler.onCompleted('Old scope result'));
    expect(onPromptChange).not.toHaveBeenCalled();
    expect(result.current.enhancedPromptId).toBeUndefined();
    expect(result.current.isEnhancing).toBe(false);
  });
});
