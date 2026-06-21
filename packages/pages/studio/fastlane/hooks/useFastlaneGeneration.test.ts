import type { FastlaneIdea } from '@genfeedai/interfaces';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ────────────────────────────────────────────────────────────
// Mock dependencies before importing the hook
// ────────────────────────────────────────────────────────────

const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({ subscribe: mockSubscribe }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => {
    // Return an async getter that calls factory with a stub token
    return async () => factory('stub-token');
  },
}));

const mockImagesPost = vi.fn();
const mockImagesFindOne = vi.fn();
vi.mock('@services/ingredients/images.service', () => ({
  ImagesService: {
    getInstance: () => ({
      post: mockImagesPost,
      findOne: mockImagesFindOne,
    }),
  },
}));

const mockVideosPost = vi.fn();
const mockVideosFindOne = vi.fn();
vi.mock('@services/ingredients/videos.service', () => ({
  VideosService: {
    getInstance: () => ({
      post: mockVideosPost,
      findOne: mockVideosFindOne,
    }),
  },
}));

const mockHeyGenGenerate = vi.fn();
vi.mock('@services/ingredients/heygen.service', () => ({
  HeyGenService: {
    getInstance: () => ({
      generate: mockHeyGenGenerate,
    }),
  },
}));

const mockIngredientsFindOne = vi.fn();
vi.mock('@services/content/ingredients.service', () => ({
  IngredientsService: {
    getInstance: () => ({
      findOne: mockIngredientsFindOne,
    }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockNotificationsError = vi.fn();
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: mockNotificationsError }),
  },
}));

vi.mock('@services/core/socket-manager.service', () => ({
  createMediaHandler: (
    onSuccess: (r: unknown) => void,
    onFailed: (e: string) => void,
  ) => ({ onSuccess, onFailed }),
}));

vi.mock('@pages/studio/generate/utils/generation-payloads', () => ({
  buildBaseGenerationPayload: vi.fn(() => ({})),
  buildImagePayload: vi.fn(() => ({})),
  buildVideoPayload: vi.fn(() => ({})),
  buildAvatarPayload: vi.fn(() => ({
    text: 'test',
    speech: '',
    avatarId: undefined,
    voiceId: undefined,
  })),
}));

vi.mock('@utils/network/generation.util', () => ({
  resolvePendingIds: (response: unknown) => {
    const r = response as { pendingIngredientIds?: string[]; id?: string };
    if (r?.pendingIngredientIds?.length) return r.pendingIngredientIds;
    if (r?.id) return [r.id];
    throw new Error('No valid ingredient IDs found');
  },
}));

// Import hook after all mocks
import { useFastlaneGeneration } from './useFastlaneGeneration';

// ────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────

function makeIdea(
  format: 'image' | 'video' | 'avatar',
  id = `idea-${format}`,
): FastlaneIdea {
  return {
    id,
    format,
    hook: 'Test hook',
    caption: 'Test caption',
    visualPrompt: 'A beautiful scene',
    platformHints: ['tiktok'],
  };
}

const DEFAULT_PARAMS = {
  brandId: 'brand-1',
  avatarIngredientId: 'avatar-1',
  voiceId: 'voice-1',
  references: [],
};

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

describe('useFastlaneGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscribe.mockReturnValue(mockUnsubscribe);
    mockImagesPost.mockResolvedValue({ id: 'img-pending-1' });
    mockVideosPost.mockResolvedValue({ id: 'vid-pending-1' });
    mockHeyGenGenerate.mockResolvedValue({ id: 'avatar-pending-1' });
    mockImagesFindOne.mockResolvedValue({
      id: 'img-1',
      url: 'https://img.url',
      thumbnailUrl: 'https://thumb.url',
    });
    mockVideosFindOne.mockResolvedValue({
      id: 'vid-1',
      url: 'https://vid.url',
      thumbnailUrl: 'https://thumb.url',
    });
    mockIngredientsFindOne.mockResolvedValue({
      id: 'avatar-1',
      url: 'https://avatar.url',
    });
  });

  it('dispatches to the correct service for each format', async () => {
    const ideas = [
      makeIdea('image', 'idea-img'),
      makeIdea('video', 'idea-vid'),
      makeIdea('avatar', 'idea-avatar'),
    ];

    const { result } = renderHook(() => useFastlaneGeneration(DEFAULT_PARAMS));

    await act(async () => {
      await result.current.startGeneration(ideas);
    });

    expect(mockImagesPost).toHaveBeenCalledTimes(1);
    expect(mockVideosPost).toHaveBeenCalledTimes(1);
    expect(mockHeyGenGenerate).toHaveBeenCalledTimes(1);
  });

  it('marks asset as failed when resolvePendingIds throws (no id in response)', async () => {
    // Post returns an empty object — resolvePendingIds will throw
    mockImagesPost.mockResolvedValue({});

    const { result } = renderHook(() => useFastlaneGeneration(DEFAULT_PARAMS));

    await act(async () => {
      await result.current.startGeneration([makeIdea('image', 'idea-bad')]);
    });

    const asset = result.current.assets.find((a) => a.idea.id === 'idea-bad');
    expect(asset?.status).toBe('failed');
  });

  it('marks asset as ready when WS success fires and findOne resolves', async () => {
    let capturedHandler: { onSuccess: (r: unknown) => void } | undefined;
    mockSubscribe.mockImplementation(
      (_url: string, handler: { onSuccess: (r: unknown) => void }) => {
        capturedHandler = handler;
        return mockUnsubscribe;
      },
    );

    const { result } = renderHook(() => useFastlaneGeneration(DEFAULT_PARAMS));

    await act(async () => {
      await result.current.startGeneration([makeIdea('image', 'idea-ws')]);
    });

    // Simulate WS success event
    await act(async () => {
      await capturedHandler?.onSuccess({ id: 'img-resolved-1' });
    });

    const asset = result.current.assets.find((a) => a.idea.id === 'idea-ws');
    expect(asset?.status).toBe('ready');
    expect(asset?.ingredientId).toBe('img-resolved-1');
    expect(mockImagesFindOne).toHaveBeenCalledWith('img-resolved-1');
  });

  it('marks asset as failed when WS error fires', async () => {
    let capturedHandler: { onFailed: (e: string) => void } | undefined;
    mockSubscribe.mockImplementation(
      (_url: string, handler: { onFailed: (e: string) => void }) => {
        capturedHandler = handler;
        return mockUnsubscribe;
      },
    );

    const { result } = renderHook(() => useFastlaneGeneration(DEFAULT_PARAMS));

    await act(async () => {
      await result.current.startGeneration([makeIdea('image', 'idea-err')]);
    });

    await act(async () => {
      capturedHandler?.onFailed('GPU timeout');
    });

    const asset = result.current.assets.find((a) => a.idea.id === 'idea-err');
    expect(asset?.status).toBe('failed');
    expect(asset?.errorMessage).toBe('GPU timeout');
  });

  it('calls every unsubscribe on unmount', async () => {
    const unsub1 = vi.fn();
    const unsub2 = vi.fn();
    let call = 0;
    mockSubscribe.mockImplementation(() => (call++ === 0 ? unsub1 : unsub2));

    const ideas = [makeIdea('image', 'idea-1'), makeIdea('video', 'idea-2')];

    const { result, unmount } = renderHook(() =>
      useFastlaneGeneration(DEFAULT_PARAMS),
    );

    await act(async () => {
      await result.current.startGeneration(ideas);
    });

    unmount();

    expect(unsub1).toHaveBeenCalledTimes(1);
    expect(unsub2).toHaveBeenCalledTimes(1);
  });
});
