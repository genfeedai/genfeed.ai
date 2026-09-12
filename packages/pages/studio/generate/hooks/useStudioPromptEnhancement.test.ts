import { act, renderHook } from '@testing-library/react';
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
});
