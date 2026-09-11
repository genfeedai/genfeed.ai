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
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: mockNotificationsError }),
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

describe('useStudioPromptEnhancement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscribe.mockReturnValue(vi.fn());
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

    const handler = mockSubscribe.mock.calls[0]?.[1] as {
      onCompleted: (result: string) => void;
    };
    act(() => {
      handler.onCompleted('An enhanced, brand-aware prompt');
    });

    expect(onPromptChange).toHaveBeenCalledWith(
      'An enhanced, brand-aware prompt',
    );
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

    const handler = mockSubscribe.mock.calls[0]?.[1] as {
      onFailed?: (error: string) => void;
    };
    act(() => {
      handler.onFailed?.('boom');
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
});
