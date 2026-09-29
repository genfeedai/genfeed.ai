import { usePromptBarEnhancement } from '@hooks/prompt-bar/use-prompt-bar-enhancement/use-prompt-bar-enhancement';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock external dependencies
vi.mock('@genfeedai/contracts/constants', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@genfeedai/contracts/constants')>();

  return {
    ...actual,
    MODEL_OUTPUT_CAPABILITIES: {
      'google/musicfx': { category: 'music' },
      'google/veo-3.1': { category: 'video' },
      'openai/dall-e-3': { category: 'image' },
      'stability/sd-xl': { category: 'image' },
    },
  };
});

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@genfeedai/services/core/socket-manager.service', () => ({
  createPromptHandler: vi.fn((onSuccess, onError) => ({
    onError,
    onSuccess,
  })),
}));

vi.mock('@genfeedai/utils/network/websocket.util', () => ({
  WebSocketPaths: {
    prompt: (id: string) => `prompt:${id}`,
  },
}));

const createMockForm = () => ({
  formState: { isValid: true },
  getValues: vi.fn((field?: string) => {
    if (field === 'text') {
      return 'original prompt text';
    }
    return {};
  }),
  setValue: vi.fn(),
  watch: vi.fn(),
});

const createMockNotificationsService = () => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
});

const createMockClipboardService = () => ({
  copyToClipboard: vi.fn().mockResolvedValue(undefined),
});

const createMockPromptsService = () => ({
  post: vi.fn().mockResolvedValue({ id: 'prompt-123' }),
});

const createBaseOptions = () => ({
  brandId: 'brand-123',
  clipboardService: createMockClipboardService(),
  form: createMockForm(),
  getPromptsService: vi.fn().mockResolvedValue(createMockPromptsService()),
  notificationsService: createMockNotificationsService(),
  organizationId: 'org-123',
  resizeTextarea: vi.fn(),
  selectedProfile: 'profile-123',
  setTextValue: vi.fn(),
  subscribe: vi.fn().mockReturnValue(vi.fn()),
  textareaRef: { current: { style: { height: '0' }, value: '' } },
  watchedModel: 'google/veo-3.1' as string,
});

describe('usePromptBarEnhancement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial State', () => {
    it('provides refs for socket management', () => {
      const { result } = renderHook(() =>
        usePromptBarEnhancement(createBaseOptions()),
      );

      expect(result.current.socketSubscriptionsRef.current).toEqual([]);
      expect(result.current.timeoutRefsRef.current).toEqual([]);
    });
  });

  describe('enhancePrompt', () => {
    it('handles service error gracefully', async () => {
      const options = createBaseOptions();
      options.getPromptsService = vi
        .fn()
        .mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => usePromptBarEnhancement(options));

      await act(async () => {
        result.current.enhancePrompt();
      });

      expect(options.notificationsService.error).toHaveBeenCalledWith(
        'Failed to enhance prompt',
      );
      expect(result.current.isEnhancing).toBe(false);
    });
  });

  describe('handleUndo', () => {
    it('restores previousPrompt when available', async () => {
      const options = createBaseOptions();
      options.form.getValues = vi.fn((field?: string) => {
        if (field === 'text') {
          return 'original text';
        }
        return {};
      });

      const { result } = renderHook(() => usePromptBarEnhancement(options));

      // First enhance to save previous prompt
      await act(async () => {
        result.current.enhancePrompt();
      });

      // Then undo
      act(() => {
        result.current.handleUndo();
      });

      expect(options.form.setValue).toHaveBeenCalledWith(
        'text',
        'original text',
        { shouldValidate: true },
      );
      expect(options.setTextValue).toHaveBeenCalledWith('original text');
      expect(options.notificationsService.info).toHaveBeenCalledWith(
        'Prompt restored',
      );
    });

    it('updates textarea value on undo', async () => {
      const options = createBaseOptions();
      const mockTextarea = { style: { height: '0' }, value: '' };
      options.textareaRef = { current: mockTextarea as HTMLTextAreaElement };
      options.form.getValues = vi.fn((field?: string) => {
        if (field === 'text') {
          return 'original text';
        }
        return {};
      });

      const { result } = renderHook(() => usePromptBarEnhancement(options));

      await act(async () => {
        result.current.enhancePrompt();
      });

      act(() => {
        result.current.handleUndo();
      });

      expect(mockTextarea.value).toBe('original text');
      expect(options.resizeTextarea).toHaveBeenCalled();
    });

    it('clears previousPrompt after undo', async () => {
      const options = createBaseOptions();
      options.form.getValues = vi.fn((field?: string) => {
        if (field === 'text') {
          return 'original text';
        }
        return {};
      });

      const { result } = renderHook(() => usePromptBarEnhancement(options));

      await act(async () => {
        result.current.enhancePrompt();
      });

      expect(result.current.previousPrompt).toBe('original text');

      act(() => {
        result.current.handleUndo();
      });

      expect(result.current.previousPrompt).toBeNull();
    });

    it('does nothing when previousPrompt is null', () => {
      const options = createBaseOptions();
      const { result } = renderHook(() => usePromptBarEnhancement(options));

      act(() => {
        result.current.handleUndo();
      });

      expect(options.form.setValue).not.toHaveBeenCalled();
      expect(options.notificationsService.info).not.toHaveBeenCalled();
    });
  });

  describe('handleCopy', () => {
    it('copies text to clipboard', async () => {
      const options = createBaseOptions();
      const { result } = renderHook(() => usePromptBarEnhancement(options));

      await act(async () => {
        await result.current.handleCopy('text to copy');
      });

      expect(options.clipboardService.copyToClipboard).toHaveBeenCalledWith(
        'text to copy',
      );
    });
  });

  describe('All Return Values', () => {
    it('returns all expected properties', () => {
      const { result } = renderHook(() =>
        usePromptBarEnhancement(createBaseOptions()),
      );

      expect(result.current).toHaveProperty('isEnhancing');
      expect(result.current).toHaveProperty('previousPrompt');
      expect(result.current).toHaveProperty('enhancePrompt');
      expect(result.current).toHaveProperty('handleUndo');
      expect(result.current).toHaveProperty('handleCopy');
      expect(result.current).toHaveProperty('socketSubscriptionsRef');
      expect(result.current).toHaveProperty('timeoutRefsRef');
    });
  });
});
